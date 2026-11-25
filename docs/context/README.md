# Start here: context for teammates joining the build

This folder is for anyone who joins the Jashn build after it started, and for the coding agent working with them. Read this page first, then your own brief: Sagnik's is [lane-e.md](lane-e.md).

## What Jashn is

Jashn is a voice-first planner for Indian weddings, in English, Hindi and Hinglish. A couple and their event manager plan the events, guests, vendors and money together. Guests get a private link with the invitation and an RSVP.

We are building it today, Wed 25 Nov 2026, at FestiveHacks in Bengaluru. Each of the three sponsors does real work in the app:

- **Sarvam AI:** speech to text, the language model and text to speech for every voice turn.
- **Flagsmith:** an A/B test of voice-first against form-first setup, a step-by-step rollout of voice, and a kill switch that makes the server refuse voice writes.
- **NudgeBee:** a recovery workflow that sees a failed invitation-card export, waits for a human to approve, and retries it.

**Must work:** 1 voice setup, 2 voice actions and answers, 3 events and itinerary, 4 guests and RSVP, 5 money ledger, 6 vendors and catering, 7 invitation and wedding website, 8 owner and manager collaboration, 9 privacy by role. Everything else is future scope today (decision D131).

## Where things are

| You need | Look in |
|---|---|
| Live status, open items, who is doing what | The Notion page "Jashn — Build HQ" (the link is in your start prompt; it is not in this public repo) |
| Every decision. **It wins over every other note** | [docs/prep/decisions.md](../prep/decisions.md). Round 6 (D131–D133) covers the late start and this folder |
| Index of all planning notes | [docs/prep/README.md](../prep/README.md) |
| Team rules for every session | [AGENTS.md](../../AGENTS.md) |
| Architecture, file ownership, routes | [docs/prep/spec/architecture.md](../prep/spec/architecture.md) (ownership is section 4.2, updated by D132) |
| Design direction | [docs/prep/design-direction.md](../prep/design-direction.md), then `DESIGN.md` and `PRODUCT.md` at the repo root |
| Demo, video and recording plan | [docs/prep/demo-script.md](../prep/demo-script.md) (times moved by D131) |
| Pitch, judge Q&A, submission checklist, README outline | [docs/prep/presentation.md](../prep/presentation.md) |
| The fictional demo wedding (Mira, Kabir, Diya, Tara) | [docs/prep/demo-data.md](../prep/demo-data.md) |

## Who is who

- **The team lead** owns the repo and every sponsor account, and drives the app in the demo and the video.
- **L**, the lead session, runs on the team lead's laptop. It writes the shared contracts, holds the keys and env files, merges pull requests in batches and watches the deploys.
- **Lanes A to D** are four coding sessions on the same laptop: A data, roles, privacy and the seed; B the planning screens; C voice and Flagsmith; D the invitation, guest site, card export and NudgeBee.
- **Lane E** is Sagnik and his agent, on his own laptop: the video, content, the presentation and the UI layer (decision D132).

## How work lands

1. Every change goes through a branch and a pull request into `main`. Branches are named `lane-<letter>-<topic>` (Lane E uses `lane-e-<topic>`); `vercel.json` skips preview deploys for them.
2. Open a draft pull request early and push to it often. Title it "E: what it delivers". Use the template's three sections.
3. CI runs typecheck, lint and unit tests on every pull request. Nothing red is ever merged.
4. L merges code in batches, in the order A, B, C, D, E: **14:00, 14:45 and 15:20**, with the freeze at **15:35** (decision D131). Each merge to `main` deploys to production on Vercel (Mumbai).
5. Merge commits only. Never push to `main`, never force-push, never rewrite pushed history.

## Rules that are easy to break

- **Commit messages, pull request titles and bodies, and branch names never name an AI tool,** and carry no `Co-Authored-By` or "Generated with" line. AI help is disclosed in the README and on the submission form instead, as the hackathon requires.
- **Secrets never go into git, Notion or chat.** That covers keys, tokens, `.env.local` and the demo accounts' passphrase. `.env.example` lists the names only.
- **Edit only your own paths** (architecture 4.2 with D132). You may import anything; ask the owner for changes to their files.
- **No `npm install`, `npx shadcn add` or anything `@latest`.** Ask L for a package; L adds it in a `lane-lead-*` pull request.
- All data in the app is fictional. Every frame of the video carries "Jashn · all data fictional".

## Staying in step across two laptops (decision D133)

L cannot message an agent on another laptop, so GitHub and Notion are the only channels.

- **GitHub:** push your branch at least every 30 minutes and whenever something works. L reads open pull requests at every batch.
- **Notion:** keep your own section of the Build HQ page current, every 30 minutes and at each milestone: what you're on, its status, the ETA and links. Put anything you need from L under "Questions and requests for the lead" in your section. L answers there.
- Edit only your own Notion section. Tick your own items elsewhere, but leave the rest of the page to L.
- Anything urgent: tell the team lead in person.
