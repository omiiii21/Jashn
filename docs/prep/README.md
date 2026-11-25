# Jashn prep notes

These are notes written before 09:00 IST on Wed 25 Nov 2026, the morning of FestiveHacks. There is no app code here: the build starts at 09:00, and the event rules allow "ideas, notes, sketches and research beforehand".

`docs/prep/decisions.md` wins over every note. Where a note disagrees with it, the decision holds until the note is fixed.

Paths are relative to the repo root.

## Who reads what, and when

- **The user** reads `docs/prep/morning-checklist.md` before leaving home and through the morning. It lists what only the user can do.
- **L, the lead session,** reads `docs/prep/build-kickoff.md` (from the 09:03 scheduled prompt to the 10:45 batch), `docs/prep/PLAN.md` (the whole day) and `docs/prep/decisions.md`.
- **Each lane session (A to D)** reads its `docs/prep/lanes/lane-x.md` first. L copies it into that lane's worktree as `CLAUDE.local.md` right after the contracts PR merges, at about 09:55.
- The lane then reads `AGENTS.md` and follows the reading order in `docs/prep/spec/README.md`.

## Start here

- `docs/prep/README.md`: this index.
- `docs/prep/decisions.md`: the lead's decisions D1–D122, which settle the contradictions between notes. It wins over every note.

## Plan and runbooks

- `docs/prep/PLAN.md`: the master plan for the day, 09:00–18:00: timeline, milestones per lane and batch, gates and fallbacks, the cut list and top risks.
- `docs/prep/build-kickoff.md`: L's step-by-step runbook from 09:00 to the 10:45 batch, with the four lane start prompts.
- `docs/prep/morning-checklist.md`: the user's short page for the morning: keys, packing, arrival and the tasks only the user can do. Not for the agents.
- `docs/prep/skills-toolkit.md`: the skills and tools for each session. decisions.md supersedes it where they disagree.
- `docs/prep/astra-plan.md`: the 01:20 strategy draft, kept for its reasoning. scope.md, the specs, demo-data.md and demo-script.md win wherever it conflicts with them (D38).

## Lane briefs

Each one becomes `CLAUDE.local.md` in that lane's worktree.

- `docs/prep/lanes/lane-a.md`: Lane A, data, roles and privacy.
- `docs/prep/lanes/lane-b.md`: Lane B, planning screens and the design system.
- `docs/prep/lanes/lane-c.md`: Lane C, voice, Flagsmith and the setup experiment.
- `docs/prep/lanes/lane-d.md`: Lane D, invitation, guest site, RSVP, card export and NudgeBee recovery.

## Specs

- `docs/prep/spec/README.md`: what each spec is for, which note wins, and the reading order for each session.
- `docs/prep/spec/architecture.md`: stack, runtime layout, folder tree and file ownership, env vars, delivery and fallback triggers.
- `docs/prep/spec/domain-and-data.md`: names, rules, commands, read models, tables and access control.
- `docs/prep/spec/voice.md`: the voice pipeline and the `propose_actions` contract.
- `docs/prep/spec/flagsmith.md`: flags, identities, segments, the setup experiment and the 09:00 Flagsmith setup.
- `docs/prep/spec/export-and-recovery.md`: the exported card, the export job and the NudgeBee recovery workflow.
- `docs/prep/spec/doc-ai.md`: Should #11, reading a printed invitation with Sarvam Document AI.
- `docs/prep/spec/acceptance.md`: the definition of done, the smoke test, the demo checklist and the Playwright demo path.

Read these with the specs:

- `docs/prep/demo-data.md`: every fictional person, amount, date and count in the demo. It wins on data values.
- `docs/prep/voice-test-set.md`: 47 test utterances in English, Hinglish and Hindi, the pass rule and the 8 live-demo lines.
- `docs/prep/design-direction.md`: the visual direction: tokens, type, icons, motion, money display, bans and rough ASCII wireframes.

## Research

Background research from the night before, checked against public sources. The specs win where they differ.

- `docs/prep/research-stack.md`: the build stack and infrastructure. architecture.md supersedes it where they differ.
- `docs/prep/research-sarvam.md`: Sarvam AI request shapes, limits and the 09:00 connectivity tests.
- `docs/prep/research-flagsmith.md`: Flagsmith facts, experiment mechanics, the SDK on Next.js and a recommended design.
- `docs/prep/research-nudgebee.md`: NudgeBee facts, Workflow Builder mechanics and the two recovery options.

## Pitch and video

- `docs/prep/demo-script.md`: the 3-minute live demo, the submission video, the recording plan and judge Q&A.
- `docs/prep/presentation.md`: the pitch, the talk track, judge Q&A, the submission checklist, the README outline, the AI disclosure and the video.

## Inputs

- `docs/prep/brief.md`: the team's approved product brief, from Notion, last edited 24 Nov 2026.
- `docs/prep/hackathon-facts.md`: FestiveHacks facts from the official pages: sponsors, prizes, judges, schedule and rules.
- `docs/prep/scope.md`: the approved scope (Must, Should and future). It is binding for the build.

`docs/prep/raw/` holds raw research dumps. It is gitignored and never committed, so it isn't listed here.
