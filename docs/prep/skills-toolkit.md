# Jashn skills toolkit (25 Nov 2026)

**Superseded by decisions.md (05:20).** Where this file disagrees, `docs/prep/decisions.md` wins:

- **D1:** CLAUDE.md, CLAUDE.local.md, `.claude/` and `.impeccable/` are gitignored; AGENTS.md is the committed rules file, and each worktree's CLAUDE.md is a local copy that points to it.
- **D2:** the typecheck Stop hook lives in each worktree's gitignored `.claude/settings.local.json`, not `.claude/settings.json`.
- **D3:** the impeccable direction round runs in the lead session at 09:10–09:27, and the user's pick is the approval; PRODUCT.md and DESIGN.md merge in the contracts PR, and Lane B owns both afterwards.
- **D6:** Playwright 1.65.1 is pinned in the scaffold install (architecture 1.2); sessions never install packages.
- **D34:** no Flagsmith code in the browser and no vercel:flags-sdk skill; @flagsmith/nodejs 9.5.0 runs on the server only.
- **D83:** lanes are named by letter: A (data, roles and privacy), B (planning screens and design system), C (voice, Flagsmith and the setup experiment), D (invitation, guest site, RSVP, card export and NudgeBee recovery). Older notes' lanes 1–4 are A–D.
- **D50, D32 and D121:** the video timeline in section 6 follows them: L has the sponsor clips in the HyperFrames shell by 14:40, take 1 comes first and doubles as the first stopwatch rehearsal (D121 replaces D29's rehearsal timing), and the fallbacks fire at 16:10 and 16:20.
- **D103 and D120:** database tests are `*.db.test.ts` and run with `npm run test:db`; CI runs `npm test` only. Each lane's Playwright spec starts its own dev server and uses its own `@example.com` accounts (section 5).
- **D119:** L writes the typecheck hook's `.claude/settings.local.json` once in `jashn-a` and copies it to B–D; `.impeccable/` is copied only if it exists (section 7).

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
- **vercel:deploy** was called core, but the Vercel MCP is unauthorized. The project is created by the dashboard import (the user, about 09:32) and deploys on push. The CLI runs as `npx vercel@66.6.0`, already logged in, and L uses it only for env vars (decision D5).
- **Nobody ran** the impeccable binary or the HyperFrames CLI (npx cache holds 0.9.38; the skills may expect newer commands). Test both before relying on them.
- **Gap no scout raised: Devanagari.** UI fonts, the exported card and video captions must all render Hindi. No skill checks this.
- **Stale slugs.** chatgpt-second-opinion names 6.1 models. Use `gpt-6.2-sol` and always pass `-m` and effort.

## 2. Core stack

| # | Skill / tool | Stage | Why it matters | Invocation |
|---|---|---|---|---|
| 1 | impeccable (4.7.0) | Direction, polish, review | The only skill that forces a non-default look and then audits it | `Skill impeccable` with `init`, then a new-screen request; later `critique <route>`, `audit <route>`, `polish <route>` |
| 2 | frontend-design file | Direction | Its list of AI tells; tell 1 (cream, serif, warm accent) sits beside our ivory, maroon and gold | Read `~/.claude/plugins/cache/claude-plugins-official/frontend-design/1.1.1/skills/frontend-design/SKILL.md` |
| 3 | domain-modeling | Lane A's first branch, `lane-a-schema` | One vocabulary (commitment, payment, estimate, outstanding, revision) across four sessions | `Skill domain-modeling` → `CONTEXT.md` |
| 4 | AGENTS.md (committed) + a local CLAUDE.md | After scaffold | Conventions every worktree inherits. CLAUDE.md is gitignored and only points to AGENTS.md (decision D1) | Hand-edit AGENTS.md |
| 5 | vercel-composition-patterns, vercel-react-best-practices | Build | Maintainable components, sane Next data fetching | `Skill` by name (not the `vercel:` copy) |
| 6 | run + Playwright | Per feature | Opus sees its own UI; each lane's spec checks its open PR, and the lead's demo-path spec runs on the `e2e` copy (decisions D46 and D120) | `/run`; Playwright 1.65.1 comes pinned in the scaffold install (decision D6), config `channel: 'chrome'`; sessions never install packages |
| 7 | /code-review | Before merge | Catches bugs in money and RSVP paths | `/code-review medium --fix` |
| 8 | /security-review | 14:45 freeze | Guest links must not expose money; keys must stay server-side | `/security-review` (needs `origin/HEAD`) |
| 9 | Sol through Codex | Risky diffs, images | Independent review; the fictional portrait | `codex exec --sandbox read-only --skip-git-repo-check -m gpt-6.2-sol -c model_reasoning_effort="medium" < prompt.txt` |
| 10 | web-design-guidelines | Review | Mechanical accessibility and interaction checks | `Skill web-design-guidelines "app/**/*.tsx"` |
| 11 | ~~vercel:flags-sdk~~ (not used, decision D34) | Lane C | No Flagsmith code in the browser; @flagsmith/nodejs 9.5.0 runs on the server only (flagsmith 6.1 and 6.9) | None |
| 12 | hyperframes, -cli, -registry | Video | Title, captions and end card around real footage | `Skill hyperframes`; `npx hyperframes check --json`, `render` |
| 13 | QuickTime + ffmpeg | Video | Real voice takes; trims and the fallback cut | Cmd+Shift+5 with mic; `ffmpeg` |

## 3. Per coding session

Commit `AGENTS.md` to main before branching, and merge `PRODUCT.md` and `DESIGN.md` in the contracts PR, or each lane invents its own. `CONTEXT.md` is Lane A's: it writes it from domain-and-data §1 through domain-modeling in `lane-a-schema` (architecture 4.2). `CLAUDE.md` is never committed: it is gitignored, and each worktree's copy points to `AGENTS.md` (decision D1). Keep worktrees under `~/Desktop/Personal/` so chatgpt-second-opinion stays loaded.

| Lane | Load | When |
|---|---|---|
| A Data, roles and privacy | domain-modeling in `lane-a-schema`, at Lane A's start (about 09:58–10:05, decision D70); `/code-review medium --fix` per merge; Sol on the permission rules; `/security-review` at freeze | No design skills |
| B Planning screens and design system | Starts from the `PRODUCT.md` and `DESIGN.md` merged in the contracts PR (the direction round ran in the lead session, 09:10–09:27; decision D3), and owns both afterwards; composition-patterns and react-best-practices while building; `critique` per screen; `polish` after 14:00 | Design hook on |
| C Voice, Flagsmith and the setup experiment | No flags-sdk skill: @flagsmith/nodejs 9.5.0 on the server only (decision D34); react-best-practices; impeccable only for the microphone panel states | Hook off |
| D Invitation, guest site, RSVP, card export and NudgeBee | impeccable with the invite as its own surface (stationery, not app chrome); `audit` at 390 px; web-design-guidelines on the RSVP form | Design hook on |

## 4. Anti-slop UI chain

1. **Direction (lead session, 09:10–09:27, about 15 min, needs you present; your pick is the approval, decision D3).** `impeccable init` writes `PRODUCT.md`; the direction round writes `DESIGN.md`. The brief's palette is pinned, so spend distinctiveness on type, layout and Indian number formatting. Check the result against the frontend-design tells. Pick a type pairing with Devanagari and one icon set, and lock both in `DESIGN.md`.
2. **Build.** Every UI edit reads impeccable's `craft-floor.md` first. Tokens only, no ad hoc colours.
3. **Motion.** One moment: the microphone states and the confirm-to-saved change. Use animate's easing table.
4. **Review.** `impeccable critique` per screen on real screenshots at 390 and 1280 px, then web-design-guidelines on changed files.
5. **Polish (after freeze).** `impeccable polish` on the five screens in the video, then `harden` on the RSVP form.

ui-ux-pro-max stays out: its wedding palette is pink and gold by category.

## 5. Code-quality loop

- **Per feature:** `npm run check` (`tsc --noEmit` and eslint) through a Stop hook, then `/run` to see it working, then commit.
- **Before each merge:** `/code-review medium --fix`, rerun the check, then `/simplify` only if the diff is large or touches shared modules.
- **Tests:** unit tests for ledger maths; RSVP idempotency is a database test. Tests that need the database are named `*.db.test.ts` and run only with `npm run test:db`. Before marking a PR ready, run `npm test`, plus `npm run test:db` if the branch has database tests; CI runs `npm test` and never touches a database (decision D103).
- **Playwright:** the lead's demo-path spec, plus one spec per lane. A lane's spec starts its own dev server (`npm run dev -- --port 300N`, in the background) and signs in or signs up its own `@example.com` accounts through the login page, with its own storage state. It never touches `e2e/.auth/` or the `e2e` copy (decision D120).
- **Once at 14:45:** `/security-review`, `/code-review high` on money and RSVP, Sol on the payment-correction diff.
- **No AI tool names in git.** Commit messages, PR titles and bodies, and branch names never name Claude or any AI tool, and carry no AI co-author line or "Generated with" footer (AGENTS.md rule 12). AI use is disclosed in the README and on the submission form instead (decision D31; presentation.md §6).
- **Skip:** superpowers and blanket TDD, `/code-review` max or ultra, mattpocock-skills, pr-review-toolkit, react-doctor, ADRs, grill-with-docs, Notion:tasks:build, per-feature `/simplify`.

## 6. Demo video pipeline (2:45)

| Step | Input | Output | Time |
|---|---|---|---|
| Shell, by 14:40, built by L, possibly in a spare session; not Lane B's (decisions D50 and D121) | `DESIGN.md` tokens, app fonts, script, the sponsor clips captured during the day (the V15 NudgeBee run, the Flagsmith refusal clip) | HyperFrames project: title card, caption style, sponsor labels, end card, the sponsor clips assembled; L checks their audio, labels and run ID | 40 min |
| Record take 1 first, right after the freeze smoke test (decision D50) | Live app, headset, mirrored phone | The submission-safe take first, recorded at once; it doubles as the first stopwatch rehearsal. By 15:30 the user checks signed-out playback of all three sponsor beats; any second run is take 2, after that check (decision D121) | 20 min |
| Assemble | Takes trimmed with ffmpeg, hand-written captions | `check --json` clean, preview approved | 15 min |
| Render and verify | — | 1080p MP4, checked with ffprobe and signed-out playback | 5–10 min (untested) |

Prerequisites, all present: ffmpeg 9.0.1, node 24, Chrome 158, HyperFrames' own headless Chrome. No music under speech, no text-to-speech narration: the product's voice is the soundtrack. Fallbacks (decision D32): at 16:10, cut the raw takes with ffmpeg concat, or use the rehearsal take; at 16:20, if the final doesn't play signed out, submit the fallback cut. Submit by 16:35, 16:45 at the latest.

## 7. Install / enable list (each needs your OK)

| Item | Command | Provenance |
|---|---|---|
| Warm the HyperFrames CLI tonight | `npx hyperframes --version` and `npx hyperframes check --help` | Already installed; first-party CLI |
| HyperFrames telemetry off | `npx hyperframes telemetry disable` | Skills send a usage beacon |
| Typecheck Stop hook | `Skill update-config`: "on Stop run npm run check" | Built in; writes the gitignored `.claude/settings.local.json` (decision D2). L writes it once in `jashn-a` at kickoff step 18 and copies it to B–D (decision D119) |
| impeccable design hook, Lanes B and D | `Skill impeccable "hooks on"` | Installed; writes `.impeccable/config.json` and `.claude/settings.local.json`; never run by a scout. `.impeccable/` is copied to B and D only if it exists (decision D119) |
| Playwright (project dependency, after 09:00) | None of its own: 1.65.1 is pinned in the scaffold install (architecture 1.2, decision D6) | Microsoft, safe; `channel: 'chrome'` avoids a browser download |

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
3. **Direction needs you for about 15 minutes, 09:10–09:27, in the lead session** (decision D3). Your pick is the approval.
4. **Devanagari in the card export.** Some image renderers do not shape Hindi correctly. Test one Hindi line in the exported PNG by 12:15.
5. **HyperFrames version drift or slow render.** Hence the warm-up tonight and the ffmpeg fallback.
6. **Hooks slow four sessions.** Keep the Stop hook to typecheck and lint; design hook only in Lanes B and D.
7. **Codex allowance.** The config defaults to Astra at ultra; an unflagged call can burn it.
