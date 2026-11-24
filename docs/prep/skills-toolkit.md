# Jashn skills toolkit (25 Nov 2026)

Written by Fable from the six scout reports in `docs/prep/raw/`, checked against the SKILL.md files. Stack assumed from the Astra plan: one Next.js app on Vercel with Supabase, four Opus worktrees.

**Almost everything we need is already on this Mac. Install nothing new; four small settings changes need your OK (section 6).**

## 1. Critic pass: what the reports got wrong

- **Mobile is out.** Two scouts ranked the Expo plugin "core". The plan is a responsive web app, so Expo, Xcode, SwiftUI and all 17 Figma skills drop.
- **brag is not the demo video.** The local copy gates 15–25 s, reroutes to brag-slim on Opus 5.5 and animates from code. The rules want "something that runs, not slides".
- **reverse-any-video** is a HyperFrames Pro feature and we are not signed in.
- **animate** was rated core, situational and skip. Its first and third recipes are hover-lift and fade-up, the two tells the design skills flag. Use its easing table only.
- **frontend-design** was rated core and situational, and is inactive in Jashn. Read its file once as a checklist; do not enable it as a second direction picker beside impeccable.
- **Video rules.** The video scout quoted Devfolio rules and a 60–120 s length. This event is not on Devfolio and sets no length. Follow the Astra plan: 2:45.
- **Captions.** `hyperframes transcribe` on Hinglish is untested. Write captions by hand from the script.
- **The web scout's "core" installs** (agent-browser, Context7, mattpocock-skills, typescript-lsp): the verifier marked the first two "caution", and the others duplicate local skills or the typecheck hook.
- **vercel:deploy** was called core, but the vercel CLI is absent and the Vercel MCP is unauthorized. Connect the GitHub repo in the Vercel dashboard and deploy on push.
- **Nobody ran** the impeccable binary or the HyperFrames CLI (npx cache holds 0.9.38; the skills may expect newer commands). Test both before relying on them.
- **Gap no scout raised: Devanagari.** UI fonts, the exported card and video captions must all render Hindi. No skill checks this.
- **Stale slugs.** chatgpt-second-opinion names 6.1 models. Use `gpt-6.2-sol` and always pass `-m` and effort.

## 2. Core stack

| # | Skill / tool | Stage | Why it matters | Invocation |
|---|---|---|---|---|
| 1 | impeccable (4.7.0) | Direction, polish, review | The only skill that forces a non-default look and then audits it | `Skill impeccable` with `init`, then a new-screen request; later `critique <route>`, `audit <route>`, `polish <route>` |
| 2 | frontend-design file | Direction | Its list of AI tells; tell 1 (cream, serif, warm accent) sits beside our ivory, maroon and gold | Read `~/.claude/plugins/cache/claude-plugins-official/frontend-design/1.1.1/skills/frontend-design/SKILL.md` |
| 3 | domain-modeling | 09:00 | One vocabulary (commitment, payment, estimate, outstanding, revision) across four sessions | `Skill domain-modeling` → `CONTEXT.md` |
| 4 | /init + CLAUDE.md | After scaffold | Conventions every worktree inherits | `/init`, then hand-edit |
| 5 | vercel-composition-patterns, vercel-react-best-practices | Build | Maintainable components, sane Next data fetching | `Skill` by name (not the `vercel:` copy) |
| 6 | run + Playwright | Per feature | Opus sees its own UI; the same spec is the demo smoke test | `/run`; `npm i -D @playwright/test`, config `channel: 'chrome'` |
| 7 | /code-review | Before merge | Catches bugs in money and RSVP paths | `/code-review medium --fix` |
| 8 | /security-review | 14:45 freeze | Guest links must not expose money; keys must stay server-side | `/security-review` (needs `origin/HEAD`) |
| 9 | Sol through Codex | Risky diffs, images | Independent review; the fictional portrait | `codex exec --sandbox read-only --skip-git-repo-check -m gpt-6.2-sol -c model_reasoning_effort="medium" < prompt.txt` |
| 10 | web-design-guidelines | Review | Mechanical accessibility and interaction checks | `Skill web-design-guidelines "app/**/*.tsx"` |
| 11 | vercel:flags-sdk | Lane 3 | Ships a Flagsmith adapter (`references/providers.md`) | `Skill vercel:flags-sdk` |
| 12 | hyperframes, -cli, -registry | Video | Title, captions and end card around real footage | `Skill hyperframes`; `npx hyperframes check --json`, `render` |
| 13 | QuickTime + ffmpeg | Video | Real voice takes; trims and the fallback cut | Cmd+Shift+5 with mic; `ffmpeg` |

## 3. Per coding session

Commit `CONTEXT.md`, `CLAUDE.md`, `PRODUCT.md` and `DESIGN.md` to main before branching, or each lane invents its own. Keep worktrees under `~/Desktop/Personal/` so chatgpt-second-opinion stays loaded.

| Lane | Load | When |
|---|---|---|
| 1 Data and roles | domain-modeling at 09:00; `/code-review medium --fix` per merge; Sol on the permission rules; `/security-review` at freeze | No design skills |
| 2 Planning screens | impeccable `init` and direction 09:00–09:30 (owns `DESIGN.md`); composition-patterns and react-best-practices while building; `critique` per screen; `polish` after 14:00 | Design hook on |
| 3 Voice + Flagsmith | vercel:flags-sdk first; react-best-practices; impeccable only for the microphone panel states | Hook off |
| 4 Invite, RSVP, export, NudgeBee | impeccable with the invite as its own surface (stationery, not app chrome); `audit` at 390 px; web-design-guidelines on the RSVP form | Design hook on |

## 4. Anti-slop UI chain

1. **Direction (lane 2, 30 min, needs you present).** `impeccable init` writes `PRODUCT.md`; the direction round writes `DESIGN.md`. The brief's palette is pinned, so spend distinctiveness on type, layout and Indian number formatting. Check the result against the frontend-design tells. Pick a type pairing with Devanagari and one icon set, and lock both in `DESIGN.md`.
2. **Build.** Every UI edit reads impeccable's `craft-floor.md` first. Tokens only, no ad hoc colours.
3. **Motion.** One moment: the microphone states and the confirm-to-saved change. Use animate's easing table.
4. **Review.** `impeccable critique` per screen on real screenshots at 390 and 1280 px, then web-design-guidelines on changed files.
5. **Polish (after freeze).** `impeccable polish` on the five screens in the video, then `harden` on the RSVP form.

ui-ux-pro-max stays out: its wedding palette is pink and gold by category.

## 5. Code-quality loop

- **Per feature:** `npm run check` (`tsc --noEmit` and eslint) through a Stop hook, then `/run` to see it working, then commit.
- **Before each merge:** `/code-review medium --fix`, rerun the check, then `/simplify` only if the diff is large or touches shared modules.
- **Tests:** unit tests only for ledger maths and RSVP idempotency; one Playwright spec for the demo path.
- **Once at 14:45:** `/security-review`, `/code-review high` on money and RSVP, Sol on the payment-correction diff.
- **Skip:** superpowers and blanket TDD, `/code-review` max or ultra, mattpocock-skills, pr-review-toolkit, react-doctor, ADRs, grill-with-docs, Notion:tasks:build, per-feature `/simplify`.

## 6. Demo video pipeline (2:45)

| Step | Input | Output | Time |
|---|---|---|---|
| Shell, 14:00–14:45 in a spare session | `DESIGN.md` tokens, app fonts, script | HyperFrames project: title card, caption style, sponsor labels, end card, placeholder clips | 40 min |
| Record, 15:30 | Live app, headset, mirrored phone | Six QuickTime takes with real voice | 20 min |
| Assemble | Takes trimmed with ffmpeg, hand-written captions | `check --json` clean, preview approved | 15 min |
| Render and verify | — | 1080p MP4, checked with ffprobe and signed-out playback | 5–10 min (untested) |

Prerequisites, all present: ffmpeg 9.0.1, node 24, Chrome 158, HyperFrames' own headless Chrome. No music under speech, no text-to-speech narration: the product's voice is the soundtrack. Fallback at 16:10: ffmpeg concat of the raw takes, or the rehearsal take.

## 7. Install / enable list (each needs your OK)

| Item | Command | Provenance |
|---|---|---|
| Warm the HyperFrames CLI tonight | `npx hyperframes --version` and `npx hyperframes check --help` | Already installed; first-party CLI |
| HyperFrames telemetry off | `npx hyperframes telemetry disable` | Skills send a usage beacon |
| Typecheck Stop hook | `Skill update-config`: "on Stop run npm run check" | Built in; writes `.claude/settings.json` |
| impeccable design hook, lanes 2 and 4 | `Skill impeccable "hooks on"` | Installed; writes `.impeccable/config.json` and `.claude/settings.local.json`; never run by a scout |
| Playwright (project dependency, after 09:00) | `npm i -D @playwright/test` | Microsoft, safe; `channel: 'chrome'` avoids a browser download |

## 8. Skip list

- Expo, Xcode, SwiftUI, Figma skills: wrong stack.
- brag, brag-slim: promo from code, not a working demo.
- reverse-any-video: paid and signed out.
- Taste skill: verifier rejected it (a Stop hook that can hold a turn 10 minutes).
- Hallmark, Emil's skills, make-interfaces-feel-better: a second set of taste rules mid-build.
- agent-browser, Chrome DevTools MCP, Playwright MCP: Playwright in the repo covers it.
- Context7: injection channel; fetch sponsor docs directly.
- impeccable update to 4.11: untested change on build day.
- Mobbin (paywalled), Adobe, ElevenLabs, Remotion, generate-image (no key).
- design, banner-design, theme-factory, ui-styling, design-system: generic or competing sources of truth.
- hyperframes-creative: its glow-and-grain house style is the slop we are avoiding.

## 9. Risks

1. **Rule on early work.** "Main coding and design work must begin after the hackathon starts." Run impeccable direction and build the video shell after 09:00.
2. **impeccable's launcher may fail.** Fallback is in its SKILL.md: read `PRODUCT.md`, `DESIGN.md` and `craft-floor.md` directly.
3. **Direction needs you for 30 minutes at check-in.** If you cannot, lane 2 proposes and you approve one screen at 09:45.
4. **Devanagari in the card export.** Some image renderers do not shape Hindi correctly. Test one Hindi line in the exported PNG by 12:15.
5. **HyperFrames version drift or slow render.** Hence the warm-up tonight and the ffmpeg fallback.
6. **Hooks slow four sessions.** Keep the Stop hook to typecheck and lint; design hook only in lanes 2 and 4.
7. **Codex allowance.** The config defaults to Astra at ultra; an unflagged call can burn it.
