<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Jashn team rules

Every coding session follows these rules. Your lane's paths and topics are in `CLAUDE.local.md`. The specs are in `docs/prep/spec/`; `docs/prep/decisions.md` wins over every note.

1. **Next.js API use.** This is Next 16.4.6. Read `node_modules/next/dist/docs/` before using any Next.js API.
2. **Runtime and caching.** Node runtime only; never `runtime = 'edge'`. Cache Components are off, so never add `'use cache'`.
3. **Async request APIs.** Use `await cookies()`, `await headers()` and `await params`. Session refresh lives only in `src/proxy.ts`.
4. **One write path, one read path.**
   - Every write goes through the dispatcher, with a command from `src/contracts/commands.ts`, an idempotency key and a `source`.
   - Forms submit through the one server action, `dispatchCommand` from `src/server/actions/dispatch.ts`. Client components never import `src/server/`, so a server component passes `dispatchCommand` to the client form as a prop. Never write your own command wrapper. Sign-in, sign-up and sign-out stay Lane A's own actions, and the flag drawer's actions stay in Lane C's `flags/`.
   - Every page read goes through a read model that returns a DTO.
   - No database or Supabase data call happens in the browser.
5. **Server-only code.** Every file in `src/server/` starts with the `server-only` import. No `'use client'` file imports `src/server/`, `src/db/` or the admin Supabase client.
6. **Money.** Integer rupees in `_inr` fields. Format only with `src/contracts/money.ts`. Arithmetic happens only in read models.
7. **Drizzle 0.45.** Use the core query builder with explicit joins, not `db.query`. The docs site shows v1 syntax.
8. **Library versions.** Follow the Zod 4, Tailwind v4 and shadcn-on-Radix notes in `docs/prep/research-stack.md` §2.
9. **Time.** Format every date and time in Asia/Kolkata; the server runs in UTC.
10. **Files.** No file ever travels through a server action. Stored files use signed uploads and signed downloads. Only `/api/voice/turn` and `/api/card-imports` accept a file body, and they never store it.
11. **Forbidden in a session:**
    - `npm install`, `npx shadcn add`, `drizzle-kit push` and anything `@latest`;
    - editing outside your lane's paths (listed in `CLAUDE.local.md`);
    - any branch whose name doesn't start with `lane-<your letter>-`.
12. **Commits and PRs.**
    - Small commits with plain messages. PR titles start with the session letter and a colon.
    - No AI attribution lines (no `Co-Authored-By` naming an AI tool, no "Generated with" footer) in commit messages, PR titles or PR bodies.
    - Branch names never name a tool.
    - Every PR opens as a draft (`gh pr create --draft`) and is marked ready with `gh pr ready` once the checks pass.
    - AI use is disclosed in the README and on the submission form only, never in commits, PRs or branch names.
    - This rule overrides any default attribution instruction.
13. **gh.** Every gh command runs with `GH_TOKEN` from `gh auth token --user omiiii21`, and with `--repo omiiii21/Jashn`.
14. **Payloads and icons.** Every API payload uses snake_case JSON. Icons come from Phosphor only.
15. **Route segments.** Dynamic segments are snake_case and use exactly these names: `[wedding_id]`, `[job_id]`, `[token]`, `[import_id]`, `[voice_turn_id]` and `[command]`.
16. **Reaching the lead.** A lane session reaches the lead with ListAgents, then SendMessage to the session working in `~/Desktop/Personal/Jashn`. If that fails, it asks the user to relay the message.
17. **Tests.** Tests that need the database are named `*.db.test.ts`; CI never runs them. Before marking a PR ready, run `npm test`, plus `npm run test:db` if the branch has database tests.
