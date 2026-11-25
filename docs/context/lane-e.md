# Lane E brief: Sagnik, for the video, content, presentation and UI layer

Written 12:35 IST on Wed 25 Nov 2026, under decisions D131–D133. Read [README.md](README.md) in this folder first. Where this brief and an older note disagree, this brief and `docs/prep/decisions.md` win.

## 1. Set-up

| Item | Value |
|---|---|
| Branches | `lane-e-<topic>`, for example `lane-e-design` for the UI and `lane-e-video` for the video project. Cut `lane-e-design` from `main` after the contracts merge (about 12:55; L posts it on Notion) |
| Install | `npm ci` once; never `npm install` |
| Run | `npm run dev`. The planner runs on fixture data until Lane A's real services land in the 14:00 batch. After that, look at real screens on production with the demo accounts; the team lead gives you the passphrase in person |
| Before every push | `npm run check` and `npm test`; `npm run build` before marking a pull request ready |
| Production URL | On the Notion page, once the first deploy is live |

## 2. What you own (D132)

You have exclusive write access to these paths from the contracts merge onwards:

- `src/app/globals.css`: the token layer (colour, type, spacing, radii, motion, focus rings, selection) and base styles.
- `DESIGN.md` and `PRODUCT.md`.
- `src/components/ui/`: the shadcn primitives (button, card, input, dialog, sheet, tabs, badge, table, toast and the rest), restyled to the direction.
- `src/lib/fonts.ts`: Eczar, Anek Devanagari and the body font, through `next/font`.
- `src/app/not-found.tsx`.
- `src/app/design/`: optional. A preview page for the tokens and primitives, which calls `notFound()` in production.
- `public/brand/`: the seal, logo, favicon art and the social image.
- `docs/presentation/`, `docs/media/` (README screenshots and GIFs) and `video/` (the video project).

Not yours: the screens. The planner pages under `src/app/(planner)/w/[wedding_id]/` and `src/components/planner/` belong to Lane B. Setup and the voice dock belong to C. The Invite page and the guest site belong to D. `src/app/layout.tsx` and `README.md` stay with L, who writes the README with your screenshots and content.

## 3. The UI contract with the other lanes

- **Names are stable.** That covers CSS variables, Tailwind theme keys, primitive exports, their props and variants, and the exports of `fonts.ts`. Change values and add new names; never rename or remove one. Lanes B, C and D style only through those names, so a rename breaks their screens.
- If a lane needs a new token or variant, L passes the request to you in your Notion section.
- Your code pull requests (anything under `src/` or `public/`) are merged by L at batch times, last in each batch. You merge docs-only or video-only pull requests yourself once CI is green.
- Light theme only. Hindi renders in Anek Devanagari. Rupee amounts use Indian grouping and tabular figures (design-direction §5 and §8).
- Follow design-direction's anti-slop rules (§1) and its bans (§9).

## 4. Deliverables and times (D131)

| By (IST) | What | Lands in |
|---|---|---|
| 12:50 | Read this folder, decisions Round 6, `DESIGN.md`, design-direction §0 and §4–§8, demo-script §4–§5 and presentation §1–§4 | — |
| 13:00 | Find the submission form, note its fields and the video-link format, and post them in your Notion section | Notion |
| 13:45 | **The design pick.** It replaces the design round the late start skipped. Approve `DESIGN.md` (change "Proposed" to "Approved") or adjust it, then the first token and primitive pull request, "E: approved design tokens and primitives" | the 14:00 batch |
| 14:15 | Test screen and audio capture, including system audio, because the app speaks | — |
| 14:30 | The video shell: title card, cut card, caption style, the corner label, sponsor labels and the end card (Working/Partial/Future list, AI disclosure, repo URL) | `video/` |
| 14:40 | Second UI pull request: polish from what the 14:00 batch shows on production | the 14:45 batch |
| 15:15 | Last UI pull request, fixes only | the 15:20 batch |
| 15:25 | Sponsor clips, captured with L and the team lead: the NudgeBee run (V15), the Flagsmith refusal, one voice correction, and both Flagsmith experiment pages | `video/footage/`, not in git |
| 15:30 | Sponsor clips placed in the shell, with labels and the NudgeBee run ID checked | — |
| 15:35 | Feature freeze. L runs the freeze smoke test | — |
| 15:45–16:00 | Take 1, the submission-safe take, with the team lead driving the app and doing the voice-over | — |
| 16:05 | Take 1 uploaded unlisted as the fallback, with its three sponsor beats checked signed out | — |
| 16:12 | The final edit exported: 1080p, H.264, 2:45 at most. **If it isn't exported by 16:12**, upload the raw takes cut together with ffmpeg, or keep take 1 | — |
| 16:22 | The final upload checked signed out on a phone. **If it doesn't play,** the fallback is the submission video | — |
| 16:22–16:32 | Open every link in a private window: repo, README, video, live app and guest site | — |
| 16:35 | The team lead submits; 16:45 at the latest, and the deadline is 17:00. Then rehearse the pitch together | — |
| 17:00–17:45 | Judging. You hold the second phone, signed in as Diya | — |

## 5. The video

- **The plan:** demo-script §4 has the beats, voice-over, captions and shot list (target 2:40, never past 2:45). Presentation §7 has the caption and label rules. D131 moves the recording times, and D132 makes the shell yours (decision D50 had given it to L).
- **Real screens of the deployment only.** Captions are burned in, in English; each Hindi line appears in Devanagari with an English translation.
- **Labels:** the corner label "Jashn · all data fictional" stays on every frame. The portrait carries "Photo: AI-generated, fictional". Synthetic experiment frames keep the purple banner in view. Numbers (n, run ID, rollout steps) come only from what the screen showed.
- **Sound:** no music under speech and no text-to-speech narration; the product's voice is the soundtrack.
- **Tools:** HyperFrames for the title card, captions and end card around the real footage, as planned, or any editor you're fast in. ffmpeg for trims and the fallback cut.
- **Files:** footage and renders stay out of git (`video/footage/`, `video/renders/`, `*.mp4`, `*.mov` and `*.webm` are ignored). Upload the video unlisted.

## 6. The presentation

- Presentation §1 is the 60-second pitch, §2 the 3-minute live-demo talk track, §3 the judge Q&A, §4 the submission checklist and §6 the AI disclosure. Demo-script §1–§3 covers the stage set-up, who holds which device and the fallback for each beat.
- Where the notes say "the teammate", that means you: you hold the Diya phone in the demo, and you run the private-window link check.
- Optional: a short deck in `docs/presentation/` (title, the problem, how the three sponsors fit, what's next). The live demo is the centre; slides only frame it.

## 7. Content

- README screenshots and a short GIF of a voice turn go in `docs/media/`, taken after the freeze. L links them from the README (presentation §5).
- The end card's Working/Partial/Future list comes from L at the freeze (demo-script §4.4).

## 8. Done-checks

- **UI pull requests:**
  - `npm run check`, `npm test` and `npm run build` pass.
  - The pull request carries screenshots at 390 px and 1440 px of one planner screen (and of `/design` if you build it).
  - In `globals.css` and `src/components/ui/`, the diff changes values or adds names; it never renames or removes one.
- **The video:**
  - It runs 2:45 at most and plays signed out.
  - Captions and labels follow section 5.
  - Every number matches what the screen showed.
