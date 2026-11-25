# Design direction notes

Prep notes written about 02:00 IST on 25 Nov 2026, before FestiveHacks starts at 9:00. Under Rule 4 this file holds ideas, references and rough ASCII sketches only. It contains no application code, CSS, token files, mockups or generated images. Everything below gets built after 9:00.

Updated about 05:55 for decisions D44 (fonts in the contracts PR) and D86 (the "Proposed" fallback), and for voice.md section 10 (₹ figures in on-screen sentences). Updated again about 06:15 for D20 and D121 (the reason chip beside the header mic, and no mic line at the foot of any wireframe), D19 and D59 (Lane D's PublishSheet) and D121's screenshot rule (section 11). decisions.md wins wherever this file still disagrees.

Inputs: `docs/prep/brief.md` (its "Interface direction" section), the impeccable 4.7.0 skill (SKILL.md, craft-floor, new-work, operate, mode-operate, mode-persuade, typeset, colorize, animate, layout), the ui-ux-pro-max skill (SKILL.md, quick-reference, pro-rules and its CSV data), frontend-design 1.1.1 (its list of the looks AI design keeps producing), and `docs/prep/raw/survey-ui-web.json`. I checked font facts by opening the Google Fonts files with fontTools, and I computed contrast ratios with the WCAG 2.x formula in python3.

---

## 0. The direction in one page: "card and khata"

Each register borrows from an object Indian families already know well.

- **The card (guest side).** The printed invitation box holds one main card and one insert card per function (haldi, mehendi, sangeet, wedding, reception), and each insert gives its own date, venue and dress code. We rebuild it as a working page. The names are set as live text, every insert has its RSVP inside it, and the guest sees only the functions they are invited to.
- **The khata (planning side).** This is the family's account book: a maroon cloth cover around ivory pages, with figures in columns and totals at the foot. Corrections are struck through with one line and initialled, never erased. The workspace shell plays the cover and the content plays the pages. The one signature move is the correction trail: a corrected figure keeps its old value struck through beside the new one, with who changed it and when. This dramatises the demo's key moment, "Actually, that advance was forty thousand."

Both registers share one palette in different doses, and Devanagari stands next to English as an equal on both.

**The risk we are steering around.** Impeccable's calibration note says AI-generated interfaces cluster around a "warm cream ground, high-contrast serif display, and a terracotta or signal-red accent". Our pinned brief of ivory, maroon and gold sits right next to that cluster. Impeccable also says "The brief wins", but adds that "a brief-pinned world pins the world, not its softest rendition". So we keep the colours and escape through how we use them:

1. Maroon owns whole regions: the workspace shell, and the page ground behind the guest card. It is never sprinkled around as an accent.
2. Gold is one flat foil colour with three jobs: the seal, the foil hairline on the card, and markers on maroon. It never appears as a gradient, and it is never used for small text on ivory.
3. Ivory comes in two weights. A near-white "paper" carries the working surfaces, and a warmer "ivory" is the card stock. Neither is the beige AI cream (#F4F1EA) spread everywhere.
4. The display serif is Indian-made and bilingual (Eczar), and it appears only on names and page titles. The tool itself speaks in one sans (Anek Devanagari).
5. The memorable moments come from what the product actually does: struck-through corrections, inserts with the RSVP inside, and lakh figures that line up in columns.

---

## 1. Anti-slop rules taken from the installed skills

### 1.1 impeccable (owns the direction and the finish)

Modes: the planning workspace is **Operate**. The guest invitation is **Experience**, where the artifact leads, with one working action (RSVP). The invitation studio is an Operate surface wrapped around an Experience preview.

- **Operate surfaces.** Impeccable puts it this way: "Someone who uses tools like this one should know where everything is before they notice the world." The world lends "type, palette, density, and one signature move" and never the layout, the navigation or the controls. It also warns against "a costume of the world's own interface: ... ruled ledger paper standing in for a table." So the khata gives us column discipline and the correction convention, and nothing else: no ruled-paper backgrounds, no cloth textures and no handwriting fonts.
- **Commit the shell colour.** "A grey screen with one accent colour is the category default without the category's polish, not restraint." The maroon cover is therefore a real region of the screen.
- **Product type.** One family is often right. Use a fixed rem scale with a step ratio around 1.125–1.2, and no display fonts in labels, buttons or data.
- **Product motion.** Transitions run 150–250 ms and show state, not decoration. There are no page-load sequences, exits are faster than entrances, and the surface gets one authored moment at most.
- **Craft-floor refusals that apply here.** Identical icon-heading-text cards as page structure. Cards inside cards. The hero-metric template (a big number, a small label, supporting stats). Eyebrow or kicker labels, which impeccable calls a hard ban ("no brief earns it back"). Section numbers like 01/02/03 unless the content is a real sequence. Modals the task doesn't need. Gradient text. Decorative glass or blur. A coloured left or right border over 1 px on cards, list items or callouts. Hard offset shadows. Sparklines or progress rings standing in for content. Monospace as a "technical" costume. Emoji or Unicode glyphs used as icons. Fake illustration such as sketchy SVG scenes or grain. Choosing light or dark by category. "Ghost cards" with a 1 px border under a wide soft shadow. Tracking tighter than -0.04em. Card radii stay at 12–16 px, and pills are for small controls only. These are defaults a brief can override: "invitation pages should look like wedding stationery" justifies near-square 2 px paper corners on the invitation and its inserts, while workspace sheets keep 12 px.
- **Verify on the render.** Body and placeholder text must reach 4.5:1 and large text 3:1. Theme the browser surfaces: text selection, the caret, scrollbars, focus rings, link underline offset and the numerals in tables. Ship every state (hover, disabled, loading, error, empty), and write copy in the product's own language.
- **Overused display faces.** Impeccable lists these as "you stopped looking" choices: Fraunces, Playfair Display, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, Inter as display, DM Sans, DM Serif, Outfit, Plus Jakarta Sans and Instrument Sans.
- **Loaded symbols stay out of decoration.** Here that means no religious marks as ornament (see section 6).

### 1.2 frontend-design 1.1.1: the named tells

Its calibration list names five clusters. (1) A warm cream background near #F4F1EA with a high-contrast serif and a terracotta accent near #D97757. (2) Near-black with a single acid-green or vermilion accent. (3) Broadsheet hairlines, zero radius and newspaper columns. (4) The SaaS card kit: identical rounded cards, one radius on everything, the same grey shadow under each, and gradient washes. (5) Template chrome: tracked ALL-CAPS eyebrows, meta strings joined with middle dots ("A · B · C"), "WORD — fragment" labels, tinted near-black standing in for black, mono for small labels, and "→" appended to links and buttons.

It adds typographic tells (one word in a headline accented in italic or colour, all-caps labels, labels stacked above content) and motion tells (a fade-and-slide-up on every section, hover transitions on every card). Its copy rules: a button says what happens ("Save changes", not "Submit"), the same verb carries through the flow (the "Publish" button leads to a "Published" message), errors don't apologise, and an empty screen invites an action.

### 1.3 ui-ux-pro-max: use it for UX rules only

Its wedding defaults are the slop we are avoiding. Font pairing row 46, "Wedding/Romance", is Great Vibes with Cormorant Infant. Product row 39 recommends "Soft UI Evolution + Aurora UI" and "Glassmorphism" with "Soft Pink (#FFD6E0) + Gold + Cream + Sage". The survey's verdict stands: "Never let it choose the palette or fonts."

What we keep from it: contrast of 4.5:1 for text and 3:1 for controls; touch targets of 44×44 or larger with 8 px gaps; no more than five bottom-nav items; visible labels; errors shown next to their field; tabular figures for money; locale-aware number formatting; reduced-motion support; exits at 60–70% of the entrance time; no emoji icons; one icon family with one stroke weight; press states that don't shift layout; confirmation and undo for destructive actions; polite live regions for status messages; and moving focus to the main content after a route change. Before the demo, run its pre-delivery checklist (`references/pro-rules.md`) on the mobile screens.

### 1.4 The survey's anti-slop chain, trimmed for an 8-hour day

1. `impeccable init` writes PRODUCT.md: Operate for the workspace, Experience for the guest page.
2. References: done in section 2. Mobbin is unavailable.
3. Direction: this file. The brief pins the direction, and impeccable says "a user- or brief-pinned direction beats the roll, always", so skip the concept-seed dice round. If a session runs `impeccable new-work`, hand it this file as the pinned direction.
4. Tokens: copy section 4 into DESIGN.md as the single source of truth. Do not create a ui-ux-pro-max MASTER.md or a second brand file.
5. Build: read impeccable's `reference/craft-floor.md` before each UI edit. `impeccable hooks on` writes to `.claude/settings.local.json`, so ask the user before turning it on.
6. Motion: section 7 decides where motion goes. If anyone uses the `animate` skill for mechanics, skip its hover-lift and fade-up recipes.
7. Load `dataviz` before building the money bar.
8. Review: `impeccable critique` and `audit` on the demo screens, `web-design-guidelines` on changed files, and the ui-ux-pro-max pre-delivery checklist on mobile.
9. Finish: `impeccable polish` and `harden` at 360, 390, 768, 1280 and 1440 px.

---

## 2. References

**Mobbin was unavailable.** The MCP needs a sign-in that this non-interactive session cannot do, and its tools did not load. The earlier UI survey (`survey-ui-web.json`) also found that its search returns "requires a paid plan". The rows below come from public pages I looked up or fetched tonight, except Splitwise, which is from general product knowledge. Each row says what to borrow (a layout, a hierarchy or a pattern) and what to leave behind. We copy no whole design.

| Reference | Link | Borrow | Leave |
| --- | --- | --- | --- |
| Paperless Post, Indian wedding invitations | https://www.paperlesspost.com/cards/category/indian | The card comes first, then content blocks for schedule, details such as dress code, and accommodation. Each function can get its own matching invitation, or all functions can share one card. "Group Sending" lets one person reply for a household. | The envelope and liner opening animation, stickers, stamps, backdrops |
| Paperless Post, Indian invitation wording guide | https://www.paperlesspost.com/blog/indian-wedding-invitation-wording/ | The order of elements: hosts and blessing, the invitation line, the couple, the date with the muhurat time, venue, dress code, reply-by date. Each Hindi ceremony name gets a short English gloss for guests who don't know it. | The US-style registry block |
| Urban Company, invite wording for sangeet, reception and other cards | https://urbancompany.com/blog/wedding-invite-wordings-guide-what-to-say-on-reception-sangeet-other-cards | One insert per function, each with its own wording and dress-code line. | Stock phrasing |
| Joy, multiple events with different guest lists | https://withjoy.com/help/en/articles/11085588-how-can-i-use-joy-to-manage-rsvps-and-schedules-for-multiple-events-when-not-everyone-is-invited-to-every-event | One master schedule with event visibility set per guest. Each guest gets one personalised RSVP flow showing only their events and questions. Events that need no reply say so. | App-install prompts, generic templates |
| Happiffie and Invitima (Indian e-invite builders) | https://www.happiffie.com/hyderabad/custom-wedding-websites-for-guests and https://peerlist.io/harsharma/project/invitima | Indian functions as first-class event types, a separate RSVP per function under one guest profile, and one shareable link. | Marketing claims (unverified) |
| Minted, foil-pressed sangeet invitation | https://www.minted.com/product/foil-pressed-sangeet-invitations/MIN-DZ6-SAF/mandapam | Foil is a pressing technique: one flat metallic colour applied to chosen elements, never a gradient. The sangeet card is sold as its own piece. | The motif artwork |
| Khatabook (Indian digital ledger) | https://apps.apple.com/in/app/id1488204139 | One ledger page per party (our vendor page) with dated entries, plain money words (jama/udhar), and reminders sent from the party page. Millions of Indian shopkeepers already read money this way. | Its credit and debit colour coding. We say paid and owed instead. |
| Splitwise | https://www.splitwise.com | The balance stated as a sentence with a direction at the top of each person's page. Ours reads "Still owed to Annapurna Caterers: ₹1,60,000". | Avatars, green and orange balance colours |
| Zola wedding budget | https://www.zola.com/wedding-budget | An overall budget split by category, with payment deadlines next to vendors. | Its ambiguity. Reviewers disagree about whether Zola separates estimates, quotes and payments, and our four-quantity rule (section 8) is the fix. |
| Google Docs, suggesting mode | https://support.google.com/docs/answer/6033474 | Suggestions look different from accepted text, each has accept and reject, and the owner is notified. We apply this to a manager's cost proposals. | Comment-thread chrome |
| Google Docs, find what's changed | https://support.google.com/docs/answer/190843 | A dot appears when someone changed the file since you last looked, and "show editors" tells you who changed a passage and when. Ours is a gold dot in the nav plus "Changed by Neha, 4:12 pm" on the field. | The full version-history UI |
| WhatsApp voice messages | https://www.macrumors.com/2017/11/28/whatsapp-locked-audio-recording-update/ and https://androidcentral.com/whatsapp-voice-messages-preview | Hold to record, slide to cancel, slide up to lock, and preview before sending. Indian families use this gesture set every day. Also the composer layout: a text field with the mic at the right. | Sending without a review step |
| Wispr Flow, "Designing a natural and useful voice interface" | https://wisprflow.ai/post/designing-a-natural-and-useful-voice-interface | A small persistent control shows that voice is available without making noise (ours is the header mic, decision D20). Latency matters more than spectacle. People should never talk "into a void": always confirm. No assistant imitating a human. | Hiding the transcript. We show what we heard. |
| Todoist smart date recognition | https://todoist.com/help/articles/205989121 | Recognised dates are highlighted inside the user's own words, and tapping a highlight turns it back into plain text. We do the same for amounts, dates, headcounts and vendor names in the transcript. | None |
| Type specimens | https://fonts.google.com/specimen/Eczar, https://fonts.google.com/specimen/Anek+Devanagari, https://fonts.google.com/specimen/Tiro+Devanagari+Hindi | Real Latin and Devanagari pairs designed together | None |

---

## 3. Two registers

| | Stationery register | Workspace register |
| --- | --- | --- |
| Surfaces | Guest website, exported card, studio preview | Overview, Events, Guests, Money, Vendors, the controls of Invite, voice panel |
| Mode (impeccable) | Experience: the card leads, with one working action (RSVP) | Operate: a calm, precise tool |
| Ground | Maroon-deep page ground (the box), with the ivory card stock on top | Ivory app ground; paper for tables and working panels; maroon-deep for the shell |
| Composition | Centred, generous margins, one card at a time, as real stationery is set | Left-aligned, grid-based, dense but calm; tables and lists, not card mosaics |
| Type | Eczar for names, function names and wording; Anek for logistics and controls | Anek for everything; Eczar only for the wedding name and page titles |
| Colour dose | Maroon carries the names and the ground, gold carries the seal and foil frame, ink carries the details | Maroon carries the shell, primary actions and committed money; status colours only where they mean something; gold only on maroon |
| Ornament | The seal, the foil hairline, insert cards, the mounted photo | None. The correction trail and the double rule under totals are the brand details |
| Motion | One authored moment (the foil frame "presses" in) plus RSVP feedback | State and feedback only (section 7) |
| Density | Low, 16–18 px text, large targets | Medium. Tables use 15 px; phones never go below 14 px for meta text |

Where they meet: the invitation studio puts workspace controls on the left and a live stationery preview on the right. The Overview can show a small thumbnail of the published invite that links to Invite.

---

## 4. Colour tokens

All values are proposals. The ratios come from one python3 run of the WCAG 2.x relative-luminance formula. Components should use the role names, never raw hex values.

### 4.1 Palette

| Token | Hex | Role |
| --- | --- | --- |
| paper | #FFFCF5 | Working surfaces: tables, panels, forms |
| ivory | #F7EFDF | App ground, invitation card stock |
| ivory-deep | #EEE2CB | Second neutral layer: side panels, studio canvas, the voice panel |
| ink | #2B1D1A | Primary text (warm near-black from the maroon family, not #111) |
| ink-2 | #54443E | Secondary text |
| ink-3 | #6E5D55 | Meta text, placeholders, captions |
| line | #E3D5BE | Decorative hairlines and dividers (no contrast duty) |
| line-strong | #8E7B6E | Input borders and control outlines (3:1 duty) |
| maroon | #6A1224 | Brand colour, primary buttons, links, selected state, committed money |
| maroon-deep | #4E0C1A | Workspace shell (rail and header), guest page ground |
| maroon-tint | #F4E1DF | Selected row, text selection |
| on-maroon-2 | #E9CFC6 | Secondary text on maroon |
| gold | #C9A24E | Foil: seal, card hairline, markers and focus ring on maroon. Never small text on ivory. |
| gold-ink | #7D5B17 | Gold when it has to be text on ivory or paper (the blessing line, the unseen-change dot) |
| paid | #2F6A3B | Mehendi green: paid, attending, saved |
| paid-tint | #E3EEDF | Paid chip ground |
| due | #8A5300 | Haldi amber: due soon, needs a look |
| due-tint | #FBEBC4 | Due chip ground |
| overdue | #B3261E | Sindoor vermilion: overdue, errors, destructive actions |
| overdue-tint | #FADBD6 | Overdue chip ground |
| proposal | #1D5468 | Peacock: proposed by the manager, not yet approved |
| proposal-tint | #DDEBEF | Proposal chip ground |
| wash | #F6E4B4 | "Just changed" highlight; fades out |

Alternative invitation theme, if time permits, applies to the invitation only. Its "Peacock and gold" uses peacock #14505E for names and headings on ivory, with peacock-deep #0D3A45 as the page ground. The workspace stays maroon, so the peacock proposal colour never collides with a peacock brand.

### 4.2 Contrast (computed)

| Foreground | Background | Ratio | Needs | Result |
| --- | --- | --- | --- | --- |
| ink #2B1D1A | paper #FFFCF5 | 15.85:1 | 4.5 | pass |
| ink #2B1D1A | ivory #F7EFDF | 14.20:1 | 4.5 | pass |
| ink #2B1D1A | ivory-deep #EEE2CB | 12.66:1 | 4.5 | pass |
| ink #2B1D1A | wash #F6E4B4 | 12.89:1 | 4.5 | pass |
| ink-2 #54443E | paper #FFFCF5 | 9.02:1 | 4.5 | pass |
| ink-2 #54443E | ivory #F7EFDF | 8.08:1 | 4.5 | pass |
| ink-2 #54443E | ivory-deep #EEE2CB | 7.20:1 | 4.5 | pass |
| ink-3 #6E5D55 | paper #FFFCF5 | 6.10:1 | 4.5 | pass |
| ink-3 #6E5D55 | ivory #F7EFDF | 5.47:1 | 4.5 | pass |
| ink-3 #6E5D55 | ivory-deep #EEE2CB | 4.87:1 | 4.5 | pass |
| ink-3 #6E5D55 | wash #F6E4B4 | 4.96:1 | 4.5 | pass |
| maroon #6A1224 | paper #FFFCF5 | 11.88:1 | 4.5 | pass |
| maroon #6A1224 | ivory #F7EFDF | 10.65:1 | 4.5 | pass |
| maroon #6A1224 | maroon-tint #F4E1DF | 9.67:1 | 4.5 | pass |
| paper #FFFCF5 | maroon #6A1224 (button label) | 11.88:1 | 4.5 | pass |
| ivory #F7EFDF | maroon-deep #4E0C1A (nav label) | 13.20:1 | 4.5 | pass |
| on-maroon-2 #E9CFC6 | maroon-deep #4E0C1A | 10.21:1 | 4.5 | pass |
| on-maroon-2 #E9CFC6 | maroon #6A1224 | 8.24:1 | 4.5 | pass |
| gold #C9A24E | maroon-deep #4E0C1A (marks, focus ring, even small text) | 6.30:1 | 4.5 | pass |
| gold #C9A24E | maroon #6A1224 (foil on a maroon card) | 5.08:1 | 3.0 | pass |
| gold-ink #7D5B17 | paper #FFFCF5 | 6.06:1 | 4.5 | pass |
| gold-ink #7D5B17 | ivory #F7EFDF | 5.43:1 | 4.5 | pass |
| paid #2F6A3B | paper #FFFCF5 | 6.31:1 | 4.5 | pass |
| paid #2F6A3B | paid-tint #E3EEDF | 5.41:1 | 4.5 | pass |
| due #8A5300 | paper #FFFCF5 | 6.18:1 | 4.5 | pass |
| due #8A5300 | due-tint #FBEBC4 | 5.36:1 | 4.5 | pass |
| overdue #B3261E | paper #FFFCF5 | 6.38:1 | 4.5 | pass |
| overdue #B3261E | overdue-tint #FADBD6 | 5.03:1 | 4.5 | pass |
| paper #FFFCF5 | overdue #B3261E (destructive button) | 6.38:1 | 4.5 | pass |
| proposal #1D5468 | paper #FFFCF5 | 8.13:1 | 4.5 | pass |
| proposal #1D5468 | proposal-tint #DDEBEF | 6.83:1 | 4.5 | pass |
| line-strong #8E7B6E | paper #FFFCF5 (input border) | 3.93:1 | 3.0 | pass |
| line-strong #8E7B6E | ivory #F7EFDF | 3.53:1 | 3.0 | pass |
| line-strong #8E7B6E | ivory-deep #EEE2CB | 3.14:1 | 3.0 | pass |
| peacock #14505E | ivory #F7EFDF (alternative theme) | 7.85:1 | 4.5 | pass |
| ivory #F7EFDF | peacock-deep #0D3A45 | 10.75:1 | 4.5 | pass |
| gold #C9A24E | peacock-deep #0D3A45 | 5.13:1 | 3.0 | pass |
| gold #C9A24E | ivory #F7EFDF | 2.10:1 | n/a | decorative only (foil hairline) |
| gold #C9A24E | paper #FFFCF5 | 2.34:1 | n/a | decorative only; use gold-ink if it carries meaning |

Two fixes from the run: my first line-strong (#9C8A7C) failed on ivory at 2.90:1, so I darkened it to #8E7B6E. Paid green and maroon are only 1.88:1 apart, so segments of the money bar sit 2 px apart on paper rather than touching, and every segment gets a printed value.

### 4.3 Dosage rules

- **Workspace.** The maroon-deep shell takes up roughly 15–20% of the screen. Content sits on paper and secondary panels on ivory. Maroon goes on primary buttons, links, the selected state and committed amounts. Gold appears only on maroon: the unseen-change dot in the nav, the focus ring inside the shell, and the seal.
- **Guest page.** A maroon-deep ground (the box) frames the top of the page, with the ivory card on it. Names are maroon, the blessing line is gold-ink, and the foil frame is a gold hairline.
- **Status colours.** Each one always comes with an icon and a word, and none of them is ever decorative. Overdue vermilion differs from brand maroon in hue and lightness (1.86:1 against each other), and maroon never means "error".
- **States.** Hover moves paper to ivory, and a maroon button to maroon-deep. Focus is a 2 px maroon ring with a 2 px offset on light grounds and a 2 px gold ring inside the shell. Disabled is ink-3 on ivory-deep with the reason written next to it. Text selection is maroon-tint with ink text, and the caret is maroon.
- **Dark mode is out for today.** The usage scene is daylight venue visits, phones in bright living rooms and the expectations of printed paper. If dark mode is built later, compose it separately rather than inverting this palette.

---

## 5. Type

### 5.1 Families

**Display serif: Eczar** (Rosetta; Vaibhav Singh). Variable weight 400–800, with Latin and Devanagari designed together.
- Use it for the couple's names, the function names and wording on the invitation, the wedding name in the shell, and page titles (h1 only).
- Why: it is an Indian design whose Latin and Devanagari share one calligraphic energy. Its Google Fonts description says it was made "to bring liveliness and vigor to multi-script typesetting in Latin and Devanagari", and that its display qualities "intensify with corresponding increase in weight". It brings a festive mood without script fonts, and it is on none of the default lists.
- What I measured: it has the ₹ glyph, Devanagari digits and stylistic sets ss01–ss03. It declares a tnum feature, but its digits stayed proportional in my check, so **Eczar never sets amounts.**

**UI sans: Anek Devanagari** (Ek Type, Mumbai; Latin by Yesha Goshar, Devanagari by Kailash Malviya). Variable weight 100–800 and width 75–125.
- Use it for everything in the workspace, and for the logistics and controls on the guest page.
- Why: one family sets English, Hindi and Hinglish in the same voice. The ₹ is drawn in the face, and it has a slashed zero (`zero`), case-sensitive forms (`case`) and fractions. The width axis condenses phone nav labels and dense table headers without needing a second family. Anek comes in ten scripts, including eight other Indic ones (Bangla, Gujarati, Gurmukhi, Kannada, Malayalam, Odia, Tamil and Telugu), so "other languages later" keeps the same look.
- What I measured: the default digits are proportional (nine different widths). With `tnum` turned on, every digit is 1107/2000 em wide, and the ₹ is 1022/2000 em.

**Optional, studio only: Tiro Devanagari Hindi** (Tiro Typeworks; John Hudson and Fiona Ross; italic by Paul Hanslow).
- This is the "classic" typeface choice in the invitation studio. It comes from the Murty Classical Library of India book series, after the 19th- and 20th-century metal types of the Nirnaya Sagar Press.
- What I measured: it has a true italic, small caps (`smcp`, `c2sc`) and the ₹ glyph. It gives a traditional printed-card feel and stays out of the workspace.

**Fallback if Anek misbehaves in Lane B's render test (about 10:05): Mukta** (also Ek Type). It has a working tnum, and its ₹ is exactly the width of its tabular digits (510/1000). It has no width axis and is very common on Indian news sites, which is why it is the second choice.

**Rejected after checking:**

| Font | Why not |
| --- | --- |
| Poppins | Eighth most popular in the skill's Google Fonts data, the default look of Indian startups, and it ships Devanagari, which makes it the lazy pick |
| Inter | AI default, no Devanagari |
| Hind | No tabular-figure feature (checked) |
| Palanquin | No ₹ glyph at all (checked) |
| Martel and Martel Sans | No tnum feature |
| Rozha One | One weight, no OpenType figure features |
| Noto Sans Devanagari | Tabular by default but generic |
| IBM Plex Sans Devanagari | On impeccable's overused list |
| Playfair, Cormorant, Great Vibes | AI wedding defaults (ui-ux-pro-max's own wedding pairing) |
| Kalam and other handwriting faces | Costume |
| "Samarkan"-style faux-Devanagari Latin | Costume |

### 5.2 Scale

The workspace uses Anek and a fixed rem scale, written size/line-height in px:

- 13/18 meta. This is the minimum, and phones use 14/20.
- 15/22 tables and dense rows.
- 16/24 body text, inputs and buttons.
- 18/26 at weight 600 for section headings.
- 22/28 at weight 600 for panel titles and key amounts (tnum).
- 28/34 in Eczar 600 for the page title (h1). The wedding name in the rail is Eczar 600 at 20/26.

The guest page on a phone:

- Names in Eczar 600 at 44–52 px, tracking -0.01em.
- The Devanagari heading line (शुभ विवाह) and insert titles in Eczar 500 at 24–26 px.
- Wording in Eczar 400 at 18/28.
- Logistics values in Anek at 16/24, and labels in Anek at 13/18 in sentence case.

### 5.3 Rules

- Turn on tabular figures (OpenType `tnum`) for every amount, count, time column and timer. Right-align amounts, attach the ₹ with no space, use weight 500 in cells and 600 in totals.
- **The ₹ subset trap.** Google Fonts puts U+20B9 in the `devanagari` and `latin-ext` subsets, not in `latin` (I checked the CSS API's unicode ranges tonight). Loading only `latin` makes the ₹ fall back to a system font, which is a classic tell of a non-Indian build. Load latin, latin-ext and devanagari, then check "₹1,50,000" by eye.
- Set line heights explicitly everywhere. Both faces have tall natural metrics (Anek about 1.71 em, Eczar about 1.78 em), so "normal" bloats buttons and chips.
- Devanagari needs about 0.1 more line height than Latin at the same size, because of the matras above and below. Never clip Hindi in fixed-height, overflow-hidden boxes. Test with कृष्ण, प्रीतिभोज and स्वागत समारोह.
- Use sentence case everywhere. No all-caps labels, and no letter-spaced small labels.
- Money in the Hindi UI keeps Latin digits. They are unambiguous and are the default for hi-IN. Devanagari digits appear only on the invitation, and only if the family picks them.
- Format numbers with the en-IN locale in whole rupees: ₹1,50,000, ₹12,00,000, ₹1,20,00,000. Sentences on screen show ₹ figures too ("₹12,00,000", not "₹12 lakh"), in English and Hindi alike (domain M7; voice.md 3.5 and section 10). Spoken and written Hindi amounts use the full words built in code (domain M7): ₹1,50,000 is "एक लाख पचास हज़ार रुपये", never a colloquial form such as डेढ़ लाख, सवा लाख or ढाई लाख (decision D22). Never write "Rs.", "INR 150000" or Western grouping like "₹150,000". Avoid short forms like "12L" except on a chart axis.

### 5.4 Draft Hindi labels (check with native speakers, as the brief requires)

| English | Hindi | English | Hindi |
| --- | --- | --- | --- |
| Overview | एक नज़र में | Planned | बजट |
| Events | कार्यक्रम | Committed | तय |
| Guests | मेहमान | Paid | दिया |
| Money | हिसाब | Still owed | बाकी |
| Vendors | वेंडर | Estimate | अंदाज़ा |
| Invite | निमंत्रण | Proposed | प्रस्तावित |

"हिसाब" (the family's accounts) and "बाकी" (what is still owed) are the words Indian families actually use for this.

---

## 6. Motifs and icons

**Allowed motifs. Each one is a crisp geometric shape, not an illustration.**

1. **The seal.** The couple's initials in Eczar 600 inside two concentric rings. It is gold on maroon, or maroon on ivory. It appears at the top of the guest page, on the exported card, as the favicon of the guest page, and at the top of the rail.
2. **The foil frame.** A 1 px gold hairline set 10–12 px in from the card edge, with square corners. It appears on the invitation and the exported card only.
3. **Insert cards.** Each function is its own card: ivory, 2 px radius, like die-cut paper. On the maroon ground it lifts with a soft offset shadow (offset and blur, ink at about 25%). On an ivory ground it gets a hairline border instead.
4. **The mounted photo.** The uploaded photo shown uncropped inside a 1 px gold-ink rule with an ivory margin, like a print in a mount. An arch frame appears only when the family explicitly chooses it, because photos are used as uploaded unless someone explicitly edits them.
5. **Devanagari as the ornament.** शुभ विवाह set large in Eczar is the decoration.
6. **Workspace details.** The double rule under totals and the struck-through correction are the only flourishes.

**Banned motifs.**

- Clip-art: mandalas, paisleys, Ganesha, kalash, peacocks, elephants, diyas, marigold garlands, mehendi hands, couple illustrations.
- Religious symbols as decoration, such as the swastika or Om. Blessing lines are optional text the family chooses: none (the default), "॥ श्री गणेशाय नमः ॥", "Bismillah", "Ik Onkar" and so on. Families are Hindu, Muslim, Sikh, Jain and Christian, and judges include a Berlin panel.
- Gold gradients, metallic sheen, glitter, paper grain, cloth or ruled-line textures, confetti and fireworks.

**Icon set: Phosphor, one family, locked.** Lucide is the shadcn default and carries the template look. Phosphor has a ₹ icon and the weights we need. If the stack uses shadcn, swap the few Lucide icons it ships (chevron, check, close) for Phosphor.

- Use the Regular weight at 20 px, with 24 px for the nav and mic and 16 px inline. Use Fill only for the active nav item and the selected RSVP check.
- I checked these names against the Phosphor catalogue bundled with ui-ux-pro-max:
  - Nav: HouseLine (Overview), CalendarDots (Events), UsersThree (Guests), CurrencyInr (Money), Storefront (Vendors), EnvelopeSimple (Invite).
  - Voice: Microphone, MicrophoneSlash, Keyboard, Waveform, SpeakerHigh, Stop.
  - Status: Check, CheckCircle, Warning, WarningCircle, Clock.
  - Details and actions: MapPin, Phone, Receipt, Paperclip, PencilSimple, Trash, ArrowCounterClockwise (undo), ClockCounterClockwise (history), ShareNetwork, DownloadSimple, Image, UserCircle, X.
- **Never use `Sparkle`**, or any "AI magic" glyph. Voice is a microphone.

---

## 7. Motion

Impeccable's Operate budget applies: 150–250 ms for routine changes, exits faster than entrances, and no page-load choreography. Arrivals decelerate (expo-out, about cubic-bezier(0.16, 1, 0.3, 1)) and exits accelerate. Nothing bounces, and nothing overshoots on money. The guest page gets the one authored moment.

### 7.1 Voice panel states

The flow follows the brief: speak, see the interpretation, review the proposed action, save, then see the updated screen and hear a short spoken confirmation. Read-only questions skip the review step.

| State | What the user sees | Motion and timing | Reduced motion |
| --- | --- | --- | --- |
| Idle | The mic in the header slot, in the same place on every screen on desktop and phone (decision D20), with a field to type a request. The reason chip ("Voice · team preview") sits beside the mic, and "Questions only" joins it while voice writes are off (flagsmith 3.1 and 3.2; decision D121). The mic does nothing when idle: no breathing, no glow. | None | None |
| Press | The mic darkens to maroon-deep and scales from 1.00 to 1.06. Haptic tick on Android. | 100 ms | Colour only |
| Listening (held or locked) | "Listening 0:06", the live transcript if streaming is available, a level meter driven by the real mic signal, "Slide to cancel" and "Lock" | Level updates every frame with about 80 ms smoothing. Cancel and lock trigger at 40 px of drag and snap back in 160 ms. | A static "Listening" label with the timer; Lock and Cancel shown as buttons |
| Interpreting (released) | "You said …" with the final transcript. The recognised spans (₹800 per person, 250 people, ₹50,000 advance) get a maroon underline, and tapping one makes it plain text again. The review card shows as a skeleton. | Transcript crossfades in 150 ms. Spans underline left to right at 150 ms each with a 40 ms stagger, six at most. The skeleton appears after 300 ms only if the result isn't ready. If the wait passes 4 s: "Still working. You can keep using the page." | Underlines appear without the draw |
| Review | An action title in plain words, fields with values, "?" on anything uncertain or missing, an "After saving" block with the resulting balances, and buttons named for the action ("Save contract and payment"). Corrections show old values struck through. | The card rises 12 px from the transcript position in 240 ms (expo-out). Dismissing it takes 160 ms. | Opacity only, 150 ms |
| Saving | The button keeps its width. A spinner appears only if saving takes more than 150 ms. Money never saves optimistically: the UI waits for the server. | 150 ms delay before the spinner | Same |
| Saved | A check replaces the spinner, and the card collapses into a one-line receipt: "Saved by Mira, 3:10 pm. Undo". The panel then lowers on a phone or stays docked on desktop, the app routes to the affected record, and the changed fields get the wash. | Check in 200 ms. Route change in 300 ms. Scroll into view within 400 ms. | An instant jump with focus moved to the record |
| Spoken reply | One or two sentences, from the saved record, in the language the user spoke. "Saved. ₹1,50,000 is still owed to Annapoorna Caterers." In Hindi: "सेव हो गया। एक लाख पचास हज़ार रुपये बाकी हैं।" (full amount words, as 5.3 says; decision D22) Captions show the exact words, with Stop. | Speech starts within 700 ms of the save confirmation and never before it | Captions are the same |

**Off the happy path.**

- No speech heard: "I didn't hear anything. Hold the mic and speak, or type." The mic stays ready.
- Low confidence: the doubtful words get a dotted underline and a question, for example "Which year? We heard 14 December."
- Network failure: "Couldn't reach the speech service. Nothing was saved. Try again or type."
- Voice turned off by the Flagsmith flag: the mic is disabled with the text "Voice is switched off right now. You can type or edit directly."
- Setup flow (both the voice-first and the form-first variant): the same review card for the draft wedding. Uncertain names, dates and amounts get the dotted underline plus where they came from ("from your photo: 14.12.26"), and each one has to be confirmed. Nothing is invented.

### 7.2 "A change appeared" (another person's edit)

1. If the record is on screen, its field background turns to wash in 120 ms, holds for 1.6 s and fades over 1.2 s. Under the field, "Changed by Neha, 4:12 pm" stays until the user opens the record. "See change" shows the old value struck through next to the new one.
2. If the record is off screen, the section's nav item gets a gold dot (6.30:1 on the shell) until it is visited. A list on screen shows one quiet line at the top, such as "Neha changed 1 event. Show". There are no toasts.
3. A remote change never moves the user's scroll position or focus.
4. If the user is editing the same field, show inline: "Neha changed this to Lotus Lawn while you were editing. Keep yours / Use Neha's."
5. With reduced motion, the wash appears without the fade for 3 s and is then removed.

### 7.3 Other moments

| Moment | Motion | Timing |
| --- | --- | --- |
| Correction strike | A 1.5 px line draws across the old figure, then the new figure fades in. Dependent totals crossfade and take the wash. Numbers never roll or count up. | 200 ms draw, 150 ms fade, 60 ms stagger to totals |
| Phone bottom sheet | Slides up to about 60% height so the affected page stays visible | Open 280 ms, close 200 ms |
| Desktop voice panel | Docks right at 400 px and reflows the content (no overlay), so the change is visible as it lands | 240 ms |
| Guest card (the one authored moment) | The gold foil hairline draws around the card on first open, like foil being pressed. The content is visible from the start. | 700 ms, once per visit, off with reduced motion |
| RSVP choice | The chip fills maroon and the check appears. The count stepper reveals itself. | 150 ms; stepper 200 ms |

---

## 8. Money display rules

| Quantity | Meaning | Comes from | How it looks |
| --- | --- | --- | --- |
| Planned | What the family means to spend, by category | Budget lines | ink-2 text; dashed outline in bars |
| Committed | Agreed with a vendor: a contract or an accepted quote | Vendor commitments | ink text; maroon outline with maroon-tint fill in bars |
| Paid | Money the family records as paid. The app does not transfer money. | Payment records | Paid-green text; solid green in bars |
| Still owed (outstanding) | Committed minus paid, per vendor | Computed | ink at weight 600; amber within 7 days of the due date; vermilion with an icon once overdue |
| Estimate | What it would cost at today's replies | RSVPs × rate | "≈" prefix, a dashed box, the word "estimate" and the formula ("230 attending × ₹800"). Never inside Committed. |
| Proposed | A manager's cost change awaiting the owner | Proposals | A peacock "Proposed" label. Excluded from all totals, with an "if approved" figure. |

The rules:

1. **Fill density encodes certainty.** Solid means paid, outlined and tinted means committed, and dashed means planned or estimated. This holds in the bar, the chips and the estimate box.
2. **Estimates and contracts never share a cell.** The contract keeps its own line ("250 plates × ₹800 = ₹2,00,000, signed 20 Nov"). The estimate sits in its own dashed box underneath with one sentence: "₹16,000 below the contract. The contract changes only if you renegotiate it."
3. **Corrections never overwrite silently.** The old value stays struck through in ink-3 beside the new value in ink, with "corrected by Mira, 3:12 pm". History lists every event, and it includes the spoken sentence when the change came by voice. Deleting a payment voids it (struck through and still listed) instead of removing it, and "Undo" on a money receipt is a void too, never a silent erase.
4. Owed amounts are positive numbers with a word, never negative numbers. Overpayment reads "Overpaid ₹5,000" in amber with an explanation.
5. Due dates read "Due 2 Dec, in 7 days", and "Overdue since 2 Dec" once overdue.
6. Verbs: "Record payment", never "Pay".
7. Tapping any total shows the records that sum to it, because every number has to come from saved records.
8. Spoken answers use the same numbers as the screen, and the screen highlights the figures that were spoken.
9. Totals get a single rule above and a double rule below, as in accounting. There are no other heavy borders.
10. No donut chart, no sparkline and no KPI tile row. Use one segmented bar with values printed beside it, and the money stated as a sentence.

---

## 9. Anti-slop bans for this product

Visual:

1. No gold gradients, sheen, glitter, foil textures or "luxury" shimmer. Gold is one flat colour.
2. No clip-art: mandala, paisley, Ganesha, kalash, peacock, elephant, diya, marigold, mehendi hands or couple illustrations. No religious mark as decoration.
3. No glassmorphism, no aurora or blob backgrounds, no glowing voice orb, no purple-blue "AI" gradients and no gradient text.
4. No emoji in the UI chrome (💍 🎉 🪔 ✨), and no sparkle icon for anything voice- or AI-related.
5. No ruled-paper, cloth or grain backgrounds. The khata lends discipline, not costume.
6. No stock photos of couples. Use only the family's upload, shown as uploaded.

Type:

7. No Inter, Poppins, Playfair, Cormorant, Great Vibes, DM Sans/Serif, Montserrat, IBM Plex, or script fonts imitating calligraphy.
8. No faux-Devanagari Latin display faces.
9. No ALL-CAPS labels, eyebrows above headings, letter-spaced small labels, or one italic or coloured word in a heading.
10. No monospace for amounts. Amounts use Anek with tabular figures.
11. No ₹ falling back to a system font (see the subset trap in 5.3).

Layout:

12. No KPI tile row such as "Days to go 47 | Guests 250 | Budget 12L".
13. No countdown hero, no donut and no sparkline.
14. No identical card grids, no cards inside cards, no ghost cards, and no coloured left-border callouts.
15. No active-nav left bar. Use a lighter maroon block with a filled icon.
16. No middle-dot meta strings ("Lotus Lawn · 7 PM · Formal"). Use labelled fields or line breaks.
17. No 01/02/03 numbering, except the actual wedding-day ceremony order, and times work better there anyway.

Motion:

18. No fade-up on scroll, no hover-lift cards, no staggered page-load entrances and no confetti on RSVP or save.
19. No rolling or counting numbers, and no ambient loops on the mic.

Copy:

20. No "Get started", "Unlock", "Seamless", "Effortless", "Oops!", exclamation marks or "→" appended to buttons.
21. Buttons name the action ("Save correction", "Send reply to the families"). Errors say what happened and what to do, without apologising.
22. Empty states teach by example: "No payments yet. Say 'I paid the caterer fifty thousand' or record one."

Voice:

23. No chatbot persona, avatar or "Hi! I'm your wedding assistant" greeting, and no typing-dots "thinking" bubble. The panel is a log of requests and results.
24. Push-to-talk only: no auto-listening. Never speak before the save is confirmed, keep replies to two sentences, and always show what we heard.
25. No invented values. Unknown fields show "?" and ask.

Data:

26. Every number comes from saved records. All demo data is Indian, fictional and labelled with the "Fictional demo data" badge (decision D21). No "John Doe" placeholders.
27. Money confirmations never appear as toasts that vanish. They stay as receipt lines and highlighted records.

---

## 10. Rough wireframes (ASCII)

All names and figures are fictional sample data, and they are illustrations only: demo-data.md's names and figures win (Mira & Kabir, Diya, Annapoorna Caterers, Banyan Hall and Lotus Hall). The wireframes use Mira & Arjun, event manager Neha, caterer Annapurna Caterers, venues Garden Hall and Lotus Lawn, Bengaluru, budget ₹12 lakh. The numbers match the brief's money example and add up across the screens. Notation: `(MIC)` is the mic button, `~~₹50,000~~` means struck through, `: :` boxes are dashed (estimates), and `(wash)` marks a field that just changed. Lines containing Devanagari drop their right border because monospace alignment breaks on them.

### 10.1 Shell

Phone (360–430 px). Six sections exceed the five-item limit for a bottom nav, so the sections become a tab row on the maroon header. The mic sits in that header, top right, on every screen, with the reason chip beside it (decisions D20 and D121); there is no bottom speak bar. I measured the fit from the font's advance widths, without kerning. At width 85, weight 500 and 14 px, the six labels take 209 px. With 8 px padding per side and a 44 px minimum tab width, the row is about 306 px, which fits the 328 px left on a 360 px screen with 16 px gutters. If the real render doesn't fit, the row scrolls and keeps the active tab in view.

```
+----------------------------------------------+
| (MA) Mira & Arjun       (N)(M) (chip) (MIC)  |  maroon-deep cover; (N)(M) = who is here now; (chip) = the reason chip; (MIC) = header mic
| Overview Events Guests Money Vendors Invite  |  active tab: ivory text + gold underline
|          ======                              |
+----------------------------------------------+
|                                              |
|   page content on paper                      |
|                                              |
|                                              |
+----------------------------------------------+
```

Desktop (1024 px and up). Active nav is a lighter maroon block with a filled icon, and `*` is the gold "changed since you looked" dot. The mic sits in a header across the top of the content column, in the same slot on every screen, with the reason chip beside it (decisions D20 and D121).

```
+--------------------+--------------------------------------------------------------+
| (MA)               |  Overview                [ Type a request... ] (chip) (MIC)  |
| Mira & Arjun       |--------------------------------------------------------------|
|                    |   page content on paper, max width 1120 px                   |
| 13 to 15 Dec 2026  |                                                              |
|                    |                                                              |
| [##] Overview      |                                                              |
| [  ] Events     *  |                                                              |
| [  ] Guests        |                                                              |
| [  ] Money         |                                                              |
| [  ] Vendors       |                                                              |
| [  ] Invite        |                                                              |
|                    |                                                              |
| Mira (owner)       |                                                              |
| Neha is in Events  |      voice panel docks here on the right (400 px) when open  |
+--------------------+--------------------------------------------------------------+
```

The later wireframes leave the shell's header out. The mic, the dock's text field and the reason chip stay in that header on every screen. No mic or request field sits at the foot of a screen; only the phone's voice panel rises from there as a bottom sheet (decisions D20 and D121).

### 10.2 Overview

The reading order is decisions, then what's coming, then money, replies and today's changes. There are no KPI tiles and no countdown number. "First function in 18 days" is a sentence. Every number opens the records behind it.

```
+------+---------------------------------------------------------------------------------+
| rail |  Mira & Arjun                                      Fictional demo data          |
|      |  Bengaluru. First function in 18 days (Haldi, Sun 13 Dec).                      |
|      |                                                                                 |
|      |  Needs your decision                                                            |
|      |  ...........................................................................   |
|      |  Decor upgrade for Sangeet                 +₹35,000   Proposed by Neha, 11 am   |
|      |  Not in committed totals until you approve.        [Decline]   [Approve]       |
|      |  ...........................................................................   |
|      |  Sangeet venue: Garden Hall -> Lotus Lawn            Changed by Neha, 4:12 pm   |
|      |  Guests still see Garden Hall.                        [Review and publish]      |
|      |                                                                                 |
|      |  Coming up                                 |  Money                             |
|      |  Sun 13 Dec                                |  ₹7,40,000 committed of ₹12,00,000 |
|      |    4:00 pm  Haldi        Home              |  [#####|========|- - - - - - - -]  |
|      |    7:00 pm  Sangeet      Lotus Lawn        |   paid  owed     not committed     |
|      |  Mon 14 Dec                                |  Paid                ₹3,10,000     |
|      |    7:30 pm  Wedding      Garden Hall       |  Still owed          ₹4,30,000     |
|      |  Tue 15 Dec                                |  Next due  ₹1,60,000 on 2 Dec      |
|      |    8:00 pm  Reception    Lotus Lawn        |            Annapurna Caterers      |
|      |                                            |                                    |
|      |  Replies      Invited   Yes   No  Waiting  |  Today                             |
|      |  Haldi             60    41    3       16  |  4:12 pm  Neha changed the Sangeet |
|      |  Sangeet          180   122   10       48  |           venue                    |
|      |  Wedding          250   230    6       14  |  3:12 pm  You corrected the        |
|      |  Reception        250   198    9       43  |           caterer's advance        |
|      |                                            |  Open tasks: 5, 2 due this week    |
|      |                                                                                 |
+------+---------------------------------------------------------------------------------+
```

On a phone the same blocks stack in the same order: decisions, coming up, the money sentence and bar, replies, today.

### 10.3 Events

The agenda is grouped by day, with the detail of the selected function on the right; on a phone the detail opens full screen. Draft changes are visible to collaborators, and guests see the published version. Conflicts are flagged in the row.

```
+------+---------------------------------------------+------------------------------------+
| rail | Events                       [Add event]    | Sangeet                       संगीत
|      | 1 change not published. Guests see the      | Sun 13 Dec 2026, 7:00 to 11:00 pm  |
|      | published schedule.   [Review and publish]  | Venue   Lotus Lawn, Indiranagar    |
|      |                                             |         was Garden Hall            |
|      | Sun 13 Dec                                  |         Changed by Neha, 4:12 pm   |
|      |   4:00-7:30 pm   Haldi       Home           | Dress   Indo-western, jewel tones  |
|      |   ! Overlaps Sangeet by 30 min              | Owner   Neha (manager)             |
|      |   7:00-11:00 pm  Sangeet     Lotus Lawn   > | Invited Family and friends (180)   |
|      |   Not published. Changed by Neha.           | Replies 122 yes, 10 no, 48 waiting |
|      | Mon 14 Dec                                  |                                    |
|      |   7:30 pm        Wedding     Garden Hall    | Requirements                       |
|      |                  muhurat 9:12 pm            |  DJ until 11 pm            Music   |
|      | Tue 15 Dec                                  |  Stage backdrop  [ref photo] Decor |
|      |   8:00 pm        Reception   Lotus Lawn     |   Upgrade proposed, +₹35,000       |
|      |                  Jain food for 12 guests,   |   (peacock "Proposed")  [Review]   |
|      |                  quote change pending       |                                    |
|      |                                             | Tasks                              |
|      |                                             |  [ ] Confirm sound vendor          |
|      |                                             |      Neha, due 2 Dec               |
|      |                                             | Activity                           |
|      |                                             |  4:12 pm  Neha changed the venue   |
|      |                                             |  11:02 am Neha proposed the decor  |
|      |                                             |           upgrade                  |
+------+---------------------------------------------+------------------------------------+
```

### 10.4 Money, with the vendor balance and correction history

Ledger view (rail as in 10.1):

```
Money                                                      [Record payment]   [Add vendor]
Budget ₹12,00,000. Committed ₹7,40,000. Paid ₹3,10,000. Still owed ₹4,30,000.
[######|============|- - - - - - - - - - - - - - - - - - - - - - - -]
 paid   owed         not yet committed: ₹4,60,000

Vendor                  Planned      Committed        Paid         Owed     Next due
---------------------------------------------------------------------------------------
Annapurna Caterers    ₹2,50,000      ₹2,00,000     ₹40,000    ₹1,60,000     2 Dec
Lotus Lawn            ₹3,00,000      ₹2,80,000   ₹1,40,000    ₹1,40,000    10 Dec
Shutterbug Studio     ₹1,50,000      ₹1,20,000     ₹60,000      ₹60,000    14 Dec
Rang Decor            ₹1,50,000      ₹1,40,000     ₹70,000      ₹70,000    12 Dec
   Upgrade proposed by Neha          +₹35,000 proposed, not in totals     [Review]
Not assigned yet      ₹3,50,000
---------------------------------------------------------------------------------------
Total                ₹12,00,000      ₹7,40,000   ₹3,10,000    ₹4,30,000
                     ==========      =========   =========    =========
```

The vendor page opens at the right on desktop and full screen on a phone:

```
+--------------------------------------------------+
| Annapurna Caterers                      Catering |
| For the Wedding dinner                           |
|                                                  |
| Still owed                             ₹1,60,000 |
| Due 2 Dec, in 7 days                    (amber)  |
|                                                  |
| Contract                                         |
| 250 plates x ₹800                      ₹2,00,000 |
| Signed 20 Nov.  quote.pdf                        |
|                                                  |
| : Estimate from replies, not the contract      : |
| : 230 attending x ₹800               ≈ ₹1,84,000 : |
| : ₹16,000 below the contract. The contract     : |
| : changes only if you renegotiate it.          : |
|                                                  |
| Payments                                         |
| 25 Nov  Advance, UPI        ~~₹50,000~~  ₹40,000 |
|         Corrected by Mira, 3:12 pm     [History] |
|                                                  |
| History                                          |
| 3:12 pm  Mira, by voice                          |
|          "Actually, that advance was forty       |
|          thousand."                              |
|          Advance          ₹50,000 -> ₹40,000     |
|          Still owed   ₹1,50,000 -> ₹1,60,000     |
| 3:10 pm  Mira, by voice                          |
|          Recorded advance ₹50,000                |
|          Added contract ₹2,00,000                |
|                                                  |
| [Record payment]  [Attach receipt]  [Edit]       |
+--------------------------------------------------+
```

### 10.5 Voice panel states (phone bottom sheet)

```
A. LISTENING (finger on the header mic)      B. INTERPRETING (released)
+------------------------------------------+ +------------------------------------------+
|  Money page, still visible above         | |  You said                                |
|------------------------------------------| |  "The caterer is charging [eight hundred |
|  Listening   0:06                        | |   per person] for [250 people]. I paid a |
|  "the caterer is charging eight hundred  | |   [fifty thousand advance]."             |
|   per person for 250 people, I paid a    | |                                          |
|   fifty thousand advance"                | |  Working out the change...               |
|                                          | |  ..............................          |
|      | || ||| |||| ||| || |              | |  ..............................          |
|      live level from the mic             | |                                          |
|  < Slide to cancel             ^ Lock    | |                              [Cancel]    |
|                                          | |  [ ] = recognised words, underlined;     |
+------------------------------------------+ |        tap one to make it plain text     |
                                             +------------------------------------------+

C. REVIEW (nothing saved yet)                C2. REVIEW A CORRECTION
+------------------------------------------+ "Actually, that advance was forty thousand."
|  Add a catering contract and an advance  | +------------------------------------------+
|                                          | |  Correct the advance. No new payment.    |
|  Vendor     Annapurna Caterers   Change  | |                                          |
|             the only caterer on file     | |  Advance, 25 Nov  ~~₹50,000~~   ₹40,000  |
|  Contract   250 x ₹800        ₹2,00,000  | |  Still owed     ~~₹1,50,000~~ ₹1,60,000  |
|  Payment    Advance, today      ₹50,000  | |  The old amount stays in History.        |
|  Paid by    ?  [UPI] [Cash] [Cheque]     | |                                          |
|  ----------------------------------------| |  [Edit]               [Save correction]  |
|  After saving                            | +------------------------------------------+
|  Still owed to Annapurna      ₹1,50,000  |
|  Wedding committed            ₹7,40,000  |
|                                          |
|  [Edit]     [Save contract and payment]  |
+------------------------------------------+

D. SAVED, THEN THE SPOKEN REPLY              E. A QUESTION (no review step)
+------------------------------------------+ "What did the event manager change today?"
|  Money > Annapurna Caterers              | +------------------------------------------+
|  Contract           ₹2,00,000  (wash)    | |  Neha changed 2 things today             |
|  Paid                 ₹50,000  (wash)    | |  4:12 pm  Sangeet venue: Garden Hall ->  |
|  Still owed         ₹1,50,000  (wash)    | |           Lotus Lawn, not published Open |
|------------------------------------------| |  11:02 am Decor upgrade proposed,        |
|  (check) Saved by Mira, 3:10 pm    Undo  | |           +₹35,000, needs you      Open  |
|  (speaker) "Saved. ₹1,50,000 is still    | |  (speaker) spoken summary, captioned     |
|   owed to Annapurna Caterers."     Stop  | +------------------------------------------+
+------------------------------------------+
```

A Hinglish question gets its answer in the language it was asked. "Sangeet ka venue kya hai?" is answered with "संगीत लोटस लॉन, इंदिरानगर में है, रविवार 13 दिसंबर, शाम 7 बजे।" The words are shown and spoken, and the answer links to the event.

On desktop the same states play in the right-docked panel. The page on the left navigates and shows the wash, so the cause and the effect are visible together.

### 10.6 Guest invitation on a phone, with RSVP

The card is scaled so that "Hello Priya and family" and the reply prompt peek above the fold on a 390×844 screen. The guest link shows no money, no vendors and no other guests (a guest directory appears only if the owner enables it and the guest opts in).

```
+----------------------------------------------+   maroon-deep ground (the box)
|                               English  हिंदी
|                     (MA)                     |   gold seal
|  +----------------------------------------+  |
|  | +------------------------------------+ |  |   ivory card; gold foil hairline
|  | |              शुभ विवाह
|  | |                                    | |  |
|  | |   With the blessings of their      | |  |
|  | |   grandparents, the Sharma and     | |  |
|  | |   Rao families invite you to the   | |  |
|  | |   wedding of                       | |  |
|  | |                                    | |  |
|  | |               Mira                 | |  |   Eczar 600, 48 px, maroon
|  | |                 &                  | |  |
|  | |               Arjun                | |  |
|  | |                                    | |  |
|  | |        [ couple photo, mounted,    | |  |
|  | |          shown as uploaded ]       | |  |
|  | |                                    | |  |
|  | |     Bengaluru, 13 to 15 Dec 2026   | |  |
|  | +------------------------------------+ |  |
|  +----------------------------------------+  |
|                                              |   ivory from here down
|  Hello Priya and family.                     |
|  You are invited to 3 celebrations.          |
|  Please reply by 1 Dec.          [Reply]     |   jumps to the first insert
|                                              |
|  +----------------------------------------+  |   insert card: Sangeet
|  | Sangeet                         संगीत
|  | Sun 13 Dec, 7:00 pm                    |  |
|  | Lotus Lawn, Indiranagar   Directions   |  |
|  | Dress: Indo-western, jewel tones       |  |
|  | Will you come?                         |  |
|  | [ Yes, attending ]  [ Can't come ]     |  |   48 px targets
|  | How many of you?       (-)  3  (+)     |  |
|  |                        up to 4         |  |
|  +----------------------------------------+  |
|  +----------------------------------------+  |   insert card: Wedding
|  | Wedding                         विवाह
|  | Mon 14 Dec, 7:30 pm. Muhurat 9:12 pm   |  |
|  | Garden Hall, Whitefield   Directions   |  |
|  | Dress: Traditional                     |  |
|  | [ Yes, attending ]  [ Can't come ]     |  |
|  +----------------------------------------+  |
|  ( Reception insert, same shape )            |
|                                              |
|  Food preferences (optional)                 |
|  [Vegetarian] [Jain] [No onion or garlic]    |
|  [ Anything else the caterer should know  ]  |
|                                              |
|  [      Send reply to the families        ]  |
|  You can change your reply later from        |
|  this link.                                  |
|                                              |
|  Add to calendar          Contact the family |
+----------------------------------------------+

After sending (replaces the button; the send runs once even if tapped twice):
  (check) Thank you, Priya. The families have your reply:
          3 for Sangeet, 3 for the Wedding, 2 for the Reception.   Change reply
```

### 10.7 Invitation studio

Controls are on the left in the workspace register, and the live stationery preview is on the right. On a phone the controls become a bottom sheet over the preview.

```
Invite                Draft. 2 changes since you published on 22 Nov.   [Review and publish]
+------------------------------------------+-----------------------------------------------+
| Wording            English | हिंदी
| [ The Sharma and Rao families invite   ] |   +---------------------------+               |
| [ you to the wedding of ...            ] |   |  guest page, live, from   |               |
| Blessing line    None  v                 |   |  the draft                |               |
|                                          |   |          (MA)             |               |
| Photo                                    |   |        शुभ विवाह
| [thumb] couple.jpg, used as uploaded     |   |      Mira & Arjun         |               |
| Frame   (*) Mounted   ( ) Arch           |   |        [photo]            |               |
|                                          |   |          ...              |               |
| Layout                                   |   +---------------------------+               |
| (*) Card with inserts                    |                                               |
| ( ) One card                             |   Not yet published                           |
| ( ) Facing pages, Hindi and English      |   Sangeet venue: Garden Hall -> Lotus Lawn,   |
|                                          |     changed by Neha, 4:12 pm                  |
| Colours                                  |   Theme: maroon and gold, by you, 3:40 pm     |
| (*) Maroon and gold                      |                                               |
| ( ) Peacock and gold                     |   Card image from 22 Nov is out of date       |
|                                          |   (the venue changed).   [Export a new card]  |
| Typeface                                 |   Card export: failed 3:42 pm. Retry is       |
| (*) Eczar   ( ) Tiro Devanagari, classic |   waiting for operator approval.              |
|                                          |                                               |
| Functions on the invite                  |   Guest link                  [Copy link]     |
| Taken from Events. Edit them in Events.  |                                               |
+------------------------------------------+-----------------------------------------------+
             Said to the header mic (I-01): "Make the invite maroon and gold. Use this photo."
```

The export job states are Queued, Rendering, Ready, Failed (with the reason) and Retrying (approved by the operator). These give the NudgeBee recovery something honest to show. "Review and publish" opens Lane D's PublishSheet (decisions D19 and D59): a list of the changes, showing old values struck through next to the new ones. The guest page changes only when the user taps "Publish revision N".

---

## 11. The direction round, then Lane B's first 20 minutes: design checklist

The direction round runs in the lead session at 09:10–09:27 (decision D3). The token step follows right after it in the lead session (decision D4). The remaining steps are Lane B's first 20 minutes, from its start at about 09:58–10:05.

- [ ] **09:10–09:27 Direction round (lead session).** L runs the impeccable direction round from this file. The user picks the direction, which takes about 15 minutes, and that pick is the approval. PRODUCT.md and DESIGN.md merge in the contracts PR, and Lane B owns both afterwards. If the direction isn't approved by 09:45, both files are committed marked "Proposed" in the contracts PR, and the user approves one screen at the 10:45 batch (decision D86).
- [ ] **Right after the pick: tokens (L, into the contracts PR).** Copy section 4's role names and hex values into the app's theme tokens and DESIGN.md. Components reference roles only. Spacing is 4/8/12/16/24/32/48/64. Radii are 2 (stationery: the invitation card and inserts), 6 (chips), 8 (controls) and 12 (workspace sheets and panels). Add the motion durations from section 7. Light theme only. They go into the token layer of `src/app/globals.css`, so Lanes C and D style with real tokens from their first minute; Lane B owns `globals.css` from then on.
- [ ] **Lane B, +0–4 min: Fonts.** The fonts arrive in the contracts PR: L's `src/lib/fonts.ts` self-hosts Eczar (400–700) and Anek Devanagari (weight 400–700, width 85–100) with the latin, latin-ext and devanagari subsets (architecture 4.3; decision D44). Lane B turns on tabular figures for amounts, counts and times. Render this test line: "₹1,50,000 बाकी है / Mira & Arjun / मीरा और अर्जुन / Sun 13 Dec, 7:00 pm / कृष्ण प्रीतिभोज". Check that the ₹ is Anek's and not a fallback, that the matras don't clip, and that the figures line up. If Anek fails, L switches `fonts.ts` to Mukta, Lane B changes only the family name in the tokens, and moves on.
- [ ] **Lane B, +4–8 min: Shell and nav.** A maroon-deep rail at 1024 px and up. On phones, a maroon header with six tabs. On both, the mic sits in the header slot, in the same place on every screen, with room beside it for Lane C's reason chip (decisions D20 and D121). Active nav is a lighter maroon block with a filled Phosphor icon, and the gold dot marks unseen changes. Focus rings are maroon on light and gold on maroon. Theme the selection colour, caret and scrollbar. Look at 360, 390, 768, 1280 and 1440 px.
- [ ] **Lane B, +8–14 min: One finished screen as the quality bar.** Build Money's Annapurna Caterers vendor page (10.4) with the fictional data: the contract, the dashed estimate box, payments with the struck-through correction, history, and the empty, loading, save-error and overdue states. It holds the hardest problems in one place: lakh figures in columns, estimate versus contract, the correction trail, status colours and Hindi labels.
- [ ] **Lane B, +14–17 min: Lock it, then apply it everywhere.** Screenshot at 390 and 1440 px. The user approves the vendor-page screenshot at the 10:45 batch only when the direction is "Proposed" (D86); otherwise L checks it against this file (decision D121). Run the bans in section 9 and the craft-floor checks: contrast, focus, every state, the browser surfaces, and copy that names actions. Fix what fails, then freeze the parts this screen introduced: the amount cell, money row, status label, section heading, history entry and review-card skeleton. Every later screen reuses them, and any new component needs a reason.

Next, in demo order: Overview (10.2, Lane B), the voice review card (10.5, Lane C), Events (10.3, Lane B), the guest page (10.6, Lane D) and the studio (10.7, Lane D's Invite page, decision D105). Before about 3 pm, run `impeccable critique` and `audit` on the Money vendor page and the guest page, and the ui-ux-pro-max pre-delivery checklist on both phone views.

---

## 12. Open decisions for the team

1. Confirm Eczar and Anek after Lane B's font render test (about 10:05). The fallback UI face is Mukta.
2. Choose the product name for the seal, the guest-page footer and the README. The brief says it is still open.
3. Confirm that the blessing line defaults to none and is chosen by the family.
4. Settled (decision D20): the mic sits in the header on every screen, on desktop and phone. The desktop speak bar at the foot of the content column is dropped. The reason chip sits beside the mic (decision D121).
5. Decide whether the Peacock invitation theme ships. Build it only after the money and guest flows work.
