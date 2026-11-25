---
name: Jashn
description: "Card and khata: the guest side is wedding stationery, and the planning side is the family's account book."
colors: {
  paper: "#FFFCF5", ivory: "#F7EFDF", ivory-deep: "#EEE2CB", ink: "#2B1D1A", ink-2: "#54443E", ink-3: "#6E5D55",
  line: "#E3D5BE", line-strong: "#8E7B6E", maroon: "#6A1224", maroon-deep: "#4E0C1A", maroon-tint: "#F4E1DF",
  on-maroon-2: "#E9CFC6", gold: "#C9A24E", gold-ink: "#7D5B17", paid: "#3F5B44", paid-tint: "#EFE8D9",
  due: "#7D5B17", due-tint: "#EFE8D9", overdue: "#A3301F", overdue-tint: "#F4E4DD", proposal: "#46525A",
  proposal-tint: "#EFE8D9", wash: "#F3E9CC", peacock: "#14505E", peacock-deep: "#0D3A45" }
typography:
  meta: { fontFamily: "Geist", fontSize: "13px", fontWeight: 400, lineHeight: "18px" }
  meta-phone: { fontFamily: "Geist", fontSize: "14px", fontWeight: 400, lineHeight: "20px" }
  table: { fontFamily: "Geist", fontSize: "15px", fontWeight: 400, lineHeight: "22px" }
  body: { fontFamily: "Geist", fontSize: "16px", fontWeight: 400, lineHeight: "24px" }
  heading: { fontFamily: "Geist", fontSize: "18px", fontWeight: 600, lineHeight: "26px" }
  panel: { fontFamily: "Geist", fontSize: "22px", fontWeight: 600, lineHeight: "28px" }
  rail-name: { fontFamily: "Geist Serif", fontSize: "20px", fontWeight: 400, lineHeight: "26px" }
  title: { fontFamily: "Geist Serif", fontSize: "28px", fontWeight: 400, lineHeight: "34px" }
  names: { fontFamily: "Eczar", fontSize: "clamp(2.75rem, 2.2rem + 2.4vw, 3.25rem)", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.01em" }
  insert-title: { fontFamily: "Eczar", fontSize: "clamp(1.5rem, 1.4rem + 0.5vw, 1.625rem)", fontWeight: 500, lineHeight: 1.4 }
  wording: { fontFamily: "Eczar", fontSize: "18px", fontWeight: 400, lineHeight: "28px" }
rounded: { paper: "2px", chip: "6px", control: "8px", sheet: "12px", pill: "9999px" }
spacing: { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "6": "24px", "8": "32px", "12": "48px", "16": "64px" }
components:
  button-primary: { backgroundColor: "{colors.maroon}", textColor: "{colors.paper}", typography: "{typography.body}", rounded: "{rounded.control}", padding: "10px 16px", height: "44px" }
  button-primary-hover: { backgroundColor: "{colors.maroon-deep}", textColor: "{colors.paper}" }
  button-secondary: { backgroundColor: "{colors.paper}", textColor: "{colors.ink}", rounded: "{rounded.control}", height: "44px" }
  button-destructive: { backgroundColor: "{colors.overdue}", textColor: "{colors.paper}", rounded: "{rounded.control}", height: "44px" }
  input: { backgroundColor: "{colors.paper}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.control}", height: "44px", padding: "10px 12px" }
  chip-paid: { backgroundColor: "{colors.paid-tint}", textColor: "{colors.paid}", rounded: "{rounded.chip}" }
  chip-due: { backgroundColor: "{colors.due-tint}", textColor: "{colors.due}", rounded: "{rounded.chip}" }
  chip-overdue: { backgroundColor: "{colors.overdue-tint}", textColor: "{colors.overdue}", rounded: "{rounded.chip}" }
  chip-proposal: { backgroundColor: "{colors.proposal-tint}", textColor: "{colors.proposal}", rounded: "{rounded.chip}" }
  sheet: { backgroundColor: "{colors.paper}", textColor: "{colors.ink}", rounded: "{rounded.sheet}", padding: "24px" }
  nav-item-active: { backgroundColor: "{colors.maroon}", textColor: "{colors.ivory}", rounded: "{rounded.control}" }
  mic: { backgroundColor: "{colors.maroon}", textColor: "{colors.ivory}", rounded: "{rounded.pill}", size: "44px" }
  invite-card: { backgroundColor: "{colors.ivory}", textColor: "{colors.ink}", rounded: "{rounded.paper}" }
---

# Design System: Jashn

**Status: Approved by Lane E (Sagnik, D132) at 13:30 on 25 Nov.** The design reference is the Doop canvas "Jashn" (https://doop.design/c/eAV3iW7YEg): Foundations (colour, type, palette options), Components and Prototype (Overview, current and voice-first). Three changes from the proposal:

1. **Type:** Geist for the interface and figures, Geist Serif for planner page titles and the rail name. The invitation keeps Eczar and Tiro, so `--font-serif`, `--font-classic` and `--font-display` are unchanged. Hindi falls back to Anek Devanagari glyph by glyph.
2. **Quiet status colours:** paid, due and proposal chips share one warm neutral ground (#EFE8D9), with colour kept in the word and the icon. Overdue keeps its own tint. Screens read maroon and ivory first.
3. **Voice-first:** voice is the first thing an owner sees after signing in. See "Voice-first landing" under Components. The header mic stays in the same slot on every screen (D20).

design-direction.md keeps the reasoning, references and wireframes, and `decisions.md` wins over both files. Lane E owns this file and `src/app/globals.css` (D132). Example names follow demo-data.md.

## Overview

**Creative North Star: "Card and khata"**

Two objects Indian families already know. **The card** is the printed invitation box: one main card and an insert per function, each with its own date, venue and dress code. The guest page rebuilds it as a working page in Experience mode: the card leads, and the one action is RSVP. **The khata** is the family account book: a maroon cloth cover around ivory pages, figures in columns, totals at the foot, and corrections struck through and initialled, never erased. The workspace runs in Operate mode. It borrows the khata's column discipline and correction convention and nothing else: no ruled paper, no cloth texture and no handwriting.

Ivory, maroon and gold sit close to the AI cluster of "warm cream, serif display, terracotta accent". We keep the brief's colours and escape that cluster through dosage. Maroon owns whole regions, gold is one flat foil, there are two distinct ivories, and the serif sets only names and titles.

**Key Characteristics:**
- A maroon-deep shell (the cover: rail and header) takes roughly 15–20% of the screen. Content sits on paper sheets over an ivory ground.
- The signature move is the correction trail: the old figure struck through beside the new one, with who changed it and when.
- Devanagari stands beside English as an equal on every surface.
- The mic sits in the header in the same slot on every screen (D20).
- Light theme only. Dark mode is out for today; if it comes later, compose it separately rather than inverting this palette.

## Colors

A committed maroon cover, two warm papers, warm near-black ink and one flat gold foil. Components use role names, never raw hex.

### Primary and foil
- **Maroon** (#6A1224): primary buttons, links, the selected state, committed money, guest names, the idle mic disc.
- **Maroon deep** (#4E0C1A): the workspace shell (rail and header), the guest page ground, and hover and press on maroon.
- **Maroon tint** (#F4E1DF): selected rows and text selection, with ink text on top. **On-maroon 2** (#E9CFC6): secondary text on maroon.
- **Gold** (#C9A24E): foil only. It has three jobs: the seal, the card's foil hairline, and markers on maroon (the unseen-change dot, the focus ring inside the shell).
- **Gold ink** (#7D5B17): gold that has to work as text on light grounds, such as the blessing line and the unseen-change dot outside the shell.

### Neutral
- **Paper** (#FFFCF5): working surfaces, meaning tables, sheets, panels, forms and popovers. **Ivory** (#F7EFDF): the app ground and the invitation card stock. **Ivory deep** (#EEE2CB): side panels, the studio canvas and the voice panel.
- **Ink** (#2B1D1A), **Ink 2** (#54443E) and **Ink 3** (#6E5D55): primary text, secondary text, and meta text with placeholders.
- **Line** (#E3D5BE): decorative hairlines, with no contrast duty. **Line strong** (#8E7B6E): input borders and control outlines, which carry the 3:1 duty.

### Status (always with an icon and a word)
The Quiet palette (approved 13:20): one warm neutral chip ground, with the status colour in the word, the dot and the icon.
- **Paid**, muted mehendi green (#3F5B44 on #EFE8D9, 6.17:1): paid, attending, saved. **Due**, gold-ink (#7D5B17 on #EFE8D9, 5.09:1): due within 7 days, needs a look, overpaid.
- **Overdue**, sindoor vermilion (#A3301F on #F4E4DD, 5.66:1): overdue, errors, destructive actions. It is the only status that keeps its own tint. Maroon never means "error".
- **Proposal**, slate (#46525A on #EFE8D9, 6.58:1): proposed by the manager and not yet approved. **Wash** (#F3E9CC): the "just changed" highlight, which fades out.
- **Invitation themes:** Maroon & Gold is the demo theme: maroon-deep ground, ivory stock, maroon names, gold foil, a gold-ink blessing and Hindi line, ink details. Peacock & Gold ships only if time allows and changes only the ground (peacock-deep #0D3A45) and the names (peacock #14505E).

### Contrast (WCAG 2.x, computed)
- **Light grounds:** ink on paper 15.85; ink-3 on paper 6.10, on ivory 5.47 and on ivory-deep 4.87; maroon on paper 11.88; gold-ink on ivory 5.43.
- **Maroon grounds:** paper on maroon 11.88 (button label); ivory on maroon-deep 13.20 (nav); ivory on maroon 10.65 (mic, active nav); on-maroon-2 on maroon-deep 10.21; gold on maroon-deep 6.30.
- **Status and controls:** paid 5.41, due 5.36, overdue 5.03 and proposal 6.83 on their tints; line-strong on paper 3.93 and on ivory-deep 3.14.
- Gold on ivory (2.10) and on paper (2.34) is decorative only. When gold carries meaning on a light ground, use gold-ink.

**The Whole Region Rule.** Maroon is a region (the shell, the guest ground) or an action, never a sprinkle of accent.
**The One Foil Rule.** Gold is one flat colour: no gradient, sheen or glitter, ever.

### In code
Tailwind utilities use the role names: `bg-paper`, `bg-ivory`, `bg-ivory-deep`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `border-line-strong`, `bg-maroon`, `bg-maroon-deep`, `bg-maroon-tint`, `text-on-maroon-2`, `text-gold`, `text-gold-ink`, `bg-paid-tint text-paid` (and the same pattern for due, overdue and proposal), `bg-wash`, and `bg-invite-ground`, `text-invite-name` and so on for the card. Raw values live once as `--jashn-*` variables. shadcn's semantic variables map onto them: background is ivory; card and popover are paper; primary is maroon; secondary and muted are ivory-deep; accent (hover) is ivory; destructive is overdue; border is line; input is line-strong; ring is maroon; and the sidebar set is the shell. Put `data-surface="shell"` on the rail and header to remap text, ring and hover for maroon. Put `data-invite-theme="peacock"` on the invitation root to switch its theme.

## Typography

**Interface Font:** Geist (Vercel; variable weight 100–900; latin and latin-ext, so the ₹ is drawn in the face). Loaded as `--font-ui`; the utility is `font-sans`, which is also the page default. The stack is Geist, then Anek Devanagari, so Hindi and Devanagari digits fall back glyph by glyph.
**Planner Title Font:** Geist Serif (OFL, committed at `public/brand/fonts/` and loaded with `next/font/local`; weight 400 only). Loaded as `--font-geist-serif`; the utility is `font-title`. Use it for the page h1 and the wedding name in the rail. Latin only; a Hindi title falls back to Eczar.
**Display Font (invitation):** Eczar (Rosetta; variable weight 400–800; Latin and Devanagari designed together). Loaded as `--font-display`; the utility is `font-serif`. Use it for guest names, function names and invitation wording, and for planner text that is mostly Hindi.
**Hindi body fallback:** Anek Devanagari (Ek Type; weight 100–800, width 75–125). Loaded as `--font-body`; it sits second in `font-sans`.
**Studio only:** Tiro Devanagari Hindi, the "classic" choice for the invitation's Hindi lines. Loaded as `--font-hindi`; the utility is `font-classic`.

**Character:** Eczar is an Indian, bilingual and festive serif that needs no script face. Anek speaks English, Hindi and Hinglish in one voice, with the ₹ drawn in the face and true tabular figures.

### Hierarchy (size/line-height in px)
- **Title** (Eczar 600, 28/34, `text-title`): the page h1 only. The wedding name in the rail is Eczar 600 at 20/26 (`text-rail-name`).
- **Panel** (Anek 600, 22/28, `text-panel`): panel titles and key amounts. **Heading** (Anek 600, 18/26, `text-heading`): section headings.
- **Body** (Anek 400, 16/24, `text-body`): body text, inputs and buttons. **Table** (15/22, `text-table`): tables and dense rows.
- **Meta** (13/18, `text-meta`): the minimum size. It switches to 14/20 on phones automatically.
- **Guest page:** names in Eczar 600 at 44–52 px with -0.01em tracking (`text-names`); शुभ विवाह and insert titles in Eczar 500 at 24–26 px (`text-insert-title`); wording in Eczar 400 at 18/28 (`text-wording`); logistics in Anek 16/24; labels in Anek 13/18.

### Hindi and money typesetting
- Load the latin, latin-ext and devanagari subsets. The ₹ (U+20B9) lives in latin-ext and devanagari, not in latin, and a system-font ₹ marks a non-Indian build. Check "₹1,50,000" by eye.
- Set line heights explicitly, because both faces have tall natural metrics. Devanagari takes about 0.1 more line height than Latin at the same size, for its matras. Never clip Hindi in a fixed-height, overflow-hidden box. Test with कृष्ण, प्रीतिभोज and स्वागत समारोह.
- Mark Hindi spans `lang="hi"`. Never track Devanagari, because letter-spacing breaks the shirorekha: add `tracking-normal` to a Devanagari line set in `text-names`.
- Use sentence case everywhere. No all-caps labels and no letter-spaced small labels.
- Amounts use `tabular-nums`, right-aligned, with the ₹ attached and no space, weight 500 in cells and 600 in totals. Eczar never sets an amount, because its figures stay proportional. Format money only through `src/contracts/money.ts`: en-IN whole rupees (₹1,50,000, ₹12,00,000), never "Rs.", "INR" or "₹150,000". The Hindi UI keeps Latin digits.
- Draft Hindi labels, to be checked by native speakers: Overview एक नज़र में, Events कार्यक्रम, Guests मेहमान, Money हिसाब, Vendors वेंडर, Invite निमंत्रण, Planned बजट, Committed तय, Paid दिया, Still owed बाकी, Estimate अंदाज़ा, Proposed प्रस्तावित.

## Layout

- **Spacing:** 4, 8, 12, 16, 24, 32, 48 and 64 px only. These are Tailwind steps 1, 2, 3, 4, 6, 8, 12 and 16 on the default 4 px base.
- **Phone (360–430 px):** 16 px gutters. The maroon-deep header holds the seal and wedding name, who is here now, the reason chip and the mic, top right. Below it, six section tabs: Anek width 85, weight 500, 14 px. The active tab gets ivory text and a gold underline, and the row scrolls if it doesn't fit. The voice panel rises as a bottom sheet to about 60% height.
- **Desktop (1024 px and up):** a maroon-deep rail with the wedding name, dates, nav, and who is here. A header across the content column holds the page title, the "Type a request" field, the reason chip and the mic. Content runs to a 1120 px maximum width (`max-w-content`). The voice panel docks right at 400 px (`w-dock`) and reflows the content; it never overlays it.
- **No mic or request field at the foot of any screen** (D20, D121).
- **Registers:** the workspace is left-aligned, grid-based, and dense but calm, built from tables and lists rather than card mosaics. The guest page is centred, with generous margins and one card at a time. Check 360, 390, 768, 1280 and 1440 px.

## Elevation & Depth

Depth comes from tonal layers: ivory-deep, then ivory, then paper, with the maroon-deep cover around them. Shadows appear in three places only: the **insert lift** (`shadow-insert`, `0 6px 18px rgb(43 29 26 / 0.25)`) for insert cards on the maroon ground, with a 1 px line border instead on ivory; the **overlay** (`shadow-overlay`, `0 8px 24px rgb(43 29 26 / 0.16)`) for popovers, menus and dialogs; and the **sheet** (`shadow-sheet`, `0 -8px 24px rgb(43 29 26 / 0.14)`) for the phone voice sheet. The overlay and sheet values are proposals. There are no ghost cards (a 1 px border under a wide soft shadow), no hard offset shadows, and no glass or blur.

## Shapes

- **Radii:** 2 px for stationery (`rounded-paper`: the invitation card and inserts, like die-cut paper), 6 px for chips (`rounded-chip`), 8 px for controls (`rounded-control`) and 12 px for workspace sheets and panels (`rounded-sheet`). Pills are for small controls only, such as the mic disc and RSVP choices.
- **Borders:** 1 px. Coloured side borders, active-nav side bars and heavy rules are banned. Totals take a single rule above and a double rule below, as in accounting.
- **The seal:** the couple's initials in Eczar 600 inside two concentric rings, gold on maroon or maroon on ivory. **The foil frame:** a 1 px gold hairline 10–12 px inside the card edge, with square corners, on the invitation and the exported card only. **The mounted photo:** the photo uncropped inside a 1 px gold-ink rule with an ivory margin.

## Components

### Buttons and chips
- **Shape:** 8 px corners, 44 px minimum height. Labels name the action ("Save correction", "Record payment"). No "→" and no exclamation marks.
- **Primary:** maroon with a paper label. Hover goes to maroon-deep. Focus is a 2 px maroon ring at 2 px offset, gold inside the shell. **Secondary:** paper with a 1 px line-strong border and an ink label; hover goes to ivory. **Destructive:** overdue with a paper label, behind a confirmation or with an undo.
- **Disabled:** ink-3 on ivory-deep, with the reason written beside it. While saving, the button keeps its width, and a spinner appears only after 150 ms.
- **Status chips:** 6 px corners, tint ground, strong text, a Phosphor icon and a word: Paid (CheckCircle), Due (Clock), Overdue (WarningCircle), Proposed. **RSVP choice:** a pill; selected fills maroon with a filled Check.

### Containers and fields
- **Workspace sheet:** paper, 12 px corners, a 1 px line border on ivory, no shadow, and 16 px padding on phones or 24 px on desktop. No cards inside cards, and no identical card grids. **Insert card:** ivory, 2 px corners, with the insert lift on maroon or a hairline on ivory.
- **Inputs:** paper, a 1 px line-strong border, 8 px corners, 44 px high, with 16 px text so phones don't zoom. Labels sit visible above the field, and placeholders are ink-3. Focus is a 2 px maroon ring. The caret is maroon, and the selection is maroon-tint with ink text. Errors appear right under the field in overdue with WarningCircle, saying what to do next.

### Navigation and the header mic
- **Rail:** maroon-deep, with ivory labels and 24 px Regular icons: HouseLine, CalendarDots, UsersThree, CurrencyInr, Storefront and EnvelopeSimple. The active item is a maroon block with a Fill icon. A gold dot marks a section with unseen changes until it is visited.
- **The mic, on every screen:** it sits in the same top-right header slot on desktop and phone. It is a 44 × 44 px minimum disc in maroon on the maroon-deep header, with a 24 px ivory Microphone icon. Lane B confirms the treatment in the shell render. Push-to-talk only.
- At idle it does nothing: no breathing and no glow. On press it darkens to maroon-deep and scales from 1.00 to 1.06 in 100 ms (colour only with reduced motion).
- The reason chip sits beside it: "Voice · team preview", plus "Questions only" while voice writes are off (D121), in on-maroon-2 text. With voice off, the mic shows MicrophoneSlash, is disabled, and reads "Voice is switched off right now. You can type or edit directly."

### Voice-first landing (Overview)
- After sign-in, the owner lands on a large **listening card** at the top of Overview: a push-to-talk disc (hold it, or hold Space anywhere), a "Listening" state with a level meter, and the live transcript. Recognised money is washed, people and vendors are maroon-tint, and dates and functions are ivory-deep. Under it: "English, हिंदी or Hinglish · Nothing is saved until you confirm", and a "type instead" link.
- Under the card, **"What I caught"** lists one card per thing heard: a kind tag (Payment correction, Dietary need, Task for Diya, Idea), the action, the words it came from, the effect on totals, and Confirm / Edit / Dismiss. One ramble can produce several cards. Voice still never writes on its own; Confirm does.
- The right column holds "Needs you" (proposals, conflicts), "At a glance" (still owed, next payment, RSVPs, next function) and recent changes.
- The pattern comes from Sagnik's NotToMiss "Today" screen (voice dump → tasks). Building it is Lane B (layout) and Lane C (voice), and Overview is scope #10, so it ships only if those sessions are ahead.

### Voice review card
- It shows "You said …" with the recognised spans underlined in maroon (tap one to make it plain text again), with a dotted underline and a question on doubtful words. Fields show "?" when uncertain or missing. An "After saving" block shows the resulting balances. The button is named for the action ("Save contract and payment"), and corrections show the old value struck through.
- On save, the card collapses into a receipt that stays: "Saved by Mira, 3:10 pm. Undo". Money never saves optimistically.

### Money row and the correction trail (signature)
- The old figure is struck through with a 1.5 px line in ink-3, the new one sits beside it in ink, and a note reads "corrected by Mira, 3:12 pm". Voided payments stay listed, struck through.
- Fill density encodes certainty: solid for paid, a maroon outline with maroon-tint fill for committed, and dashed for planned and estimated. An estimate gets "≈", a dashed box, the word "estimate" and its formula ("230 attending × ₹800"). It never shares a cell with the contract.
- One segmented bar, with values printed beside it and segments 2 px apart. Still owed is a positive figure with a word: "Due 2 Dec, in 7 days" or "Overdue since 2 Dec".

### Guest card and inserts
- The card sits on the maroon-deep ground (the box): ivory stock, the foil frame, the seal on top, maroon names, an optional gold-ink blessing line (none by default) and ink details. Each function is an insert with its own date, venue, dress code and RSVP inside. Guests see only their own functions.

## Motion

- **Durations:** 100 ms press; 120 ms wash in; 150 ms for routine changes and crossfades; 160 ms dismiss and snap-back; 200 ms exits, the save check and sheet close; 240 ms for the review card rising and the desktop dock; 280 ms phone sheet open; 300 ms route change; 700 ms foil draw, once per visit. The wash comes in over 120 ms, holds for 1.6 s and fades over 1.2 s (`animate-wash`).
- **Easing:** arrivals decelerate on `ease-arrive`, cubic-bezier(0.16, 1, 0.3, 1). Exits accelerate on `ease-leave` and take 60–70% of the entrance time.
- **Correction strike:** a 200 ms line draw, a 150 ms fade-in for the new figure, and a 60 ms stagger to the dependent totals. Numbers never roll or count up.
- **Remote edits:** the wash plus "Changed by Diya, 4:12 pm". An edit off screen puts a gold nav dot on its section. A remote change never moves the user's scroll or focus, and nothing appears as a toast.
- **Reduced motion:** opacity or colour changes only. The wash shows for 3 s without the fade, and the foil draw is off.

## Do's and Don'ts

### Do:
- **Do** use role tokens (`bg-paper`, `text-ink-2`, `border-line-strong`), never raw hex, and turn on `tabular-nums` for every amount, count, time column and timer.
- **Do** pair every status colour with an icon and a word.
- **Do** use Phosphor only: Regular at 20 px, with 24 px for the nav and mic and 16 px inline. Use Fill only for the active nav item and the selected RSVP check.
- **Do** theme the selection, caret, scrollbars and focus rings, and ship every state: hover, disabled, loading, error and empty. Empty states teach by example: "No payments yet. Say 'I paid the caterer fifty thousand' or record one."
- **Do** show the "Fictional demo data" badge on every screen (D21).

### Don't:
- **Don't** use gold gradients, sheen, glitter or textures, or small gold text on ivory or paper.
- **Don't** use clip-art or religious marks as ornament: no mandala, paisley, Ganesha, kalash, peacock, elephant, diya, marigold, mehendi hands or couple illustrations, and no swastika or Om.
- **Don't** use glassmorphism, aurora or blob backgrounds, a glowing voice orb, purple-blue gradients, gradient text, the Sparkle icon or emoji in the chrome.
- **Don't** use Inter, Poppins, Playfair, Cormorant, Great Vibes, DM Sans or DM Serif, Montserrat, IBM Plex, script faces, faux-Devanagari Latin faces, or monospace for amounts.
- **Don't** use eyebrow labels, middle-dot meta strings, 01/02/03 numbering, KPI tile rows, countdown heroes, donuts, sparklines, ghost cards or cards inside cards.
- **Don't** use ruled-paper, cloth or grain backgrounds, stock couple photos, fade-up on scroll, hover-lift cards or confetti, or confirm money in a toast that vanishes.
