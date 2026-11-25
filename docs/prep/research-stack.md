# Jashn: build stack and infrastructure

Research note for FestiveHacks, 25 Nov 2026. Written 01:45–02:50 IST, before the 09:00 start, as allowed by the event rules ("Ideas, notes, sketches and research beforehand are fine": https://www.wemakedevs.org/hackathons/festivehacks/rules).

How to read it:
- Sources are public docs, the npm registry and GitHub. Every fact links to its source.
- "(estimate)" marks my own arithmetic.
- "(judgement)" marks a recommendation rather than a fact.
- Anything I could not confirm is listed in section 14.
- Package versions were read with `npm view` on 25 Nov 2026.

---

## 1. Verdict

**Recommended stack**
- **App and hosting.** One Next.js 16.4.6 app (App Router, Node runtime) on Vercel Hobby, with functions running in Mumbai (`bom1`).
- **Backend.** One Supabase Free project in Mumbai provides Postgres, Auth and Storage.
- **Data access.** The browser never talks to the database. Every read and write goes through server-side TypeScript (Drizzle ORM 0.45.4 on postgres.js 3.4.9), behind one authorization module.
- **Live updates.** Each screen polls a version number every 2.5 s and calls `router.refresh()` when it changes.
- **Card export.** Headless Chromium renders the invitation cards inside a Node route.
- **NudgeBee recovery.** NudgeBee drives a Postgres-backed export job through two HTTPS endpoints: one reports status, the other retries idempotently.

**Why, in five points**
1. **The card's Hindi text decides the renderer.**
   - next/og in Next 16.4.6 is built on Satori 0.29. Satori only gained HarfBuzz text shaping in 0.33, and its Indic-script issue is still open.
   - Chromium shapes Devanagari the way any browser does (section 7).
2. **One provider, one city.** Supabase puts the database, auth and files in Mumbai (ap-south-1), next to Vercel's `bom1`. Neon has no India region.
3. **Authorization lives in one TypeScript module.** Four parallel AI sessions will keep that consistent more easily than a set of RLS policies. Guest links are tokens checked on the server (section 6).
4. **Polling is the guaranteed path** for "the manager's change appears on the owner's screen". Supabase Realtime is an optional doorbell on top (section 6.5).
5. **The scaffold has five version traps.**
   - create-next-app 16.4.6 turns Cache Components on by default.
   - shadcn now defaults to Base UI instead of Radix.
   - postgres.js 4 breaks Drizzle.
   - Vercel defaults to Node 26.
   - create-next-app refuses this folder, because README.md and .env.local already exist.

   Section 11 works around all five.

**Fallback.** Neon (via the Vercel Marketplace) with Better Auth, Vercel Blob and polling. It reuses the same Drizzle schema and services. Decide by 09:30 (section 3).

**Tonight's setup:**
- Install the Vercel CLI and log in.
- Create an empty Supabase project in Mumbai and save its keys.
- Install cloudflared.

Do nothing else tonight (section 10).

---

## 2. Recommended stack and why

| Layer | Choice | Why | Source |
|---|---|---|---|
| Framework | `next@16.4.6`, App Router, TypeScript, Turbopack, Node runtime, Cache Components **off**, `src/` directory | Latest stable release (published 2026-11-09). Ships 475 doc files in `node_modules/next/dist/docs/`, and the generated AGENTS.md tells agents to read them. | [npm](https://www.npmjs.com/package/next), [bundled docs](https://unpkg.com/next@16.4.6/dist/docs/) |
| Hosting | Vercel Hobby, functions in `bom1`, Node `24.x` | Zero-config Next.js. The public production domain serves phones, NudgeBee and the card renderer. | see "Vercel facts" below |
| Database | Supabase Postgres, Free plan, Mumbai | Same city as `bom1` | [Supabase regions](https://supabase.com/docs/guides/platform/regions) |
| Data access | drizzle-orm 0.45.4, drizzle-kit 0.31.11, postgres 3.4.9; server only | One typed schema shared by four sessions, SQL migrations in git, real transactions | [Drizzle + Supabase](https://orm.drizzle.team/docs/connect-supabase) |
| Auth | Supabase Auth with email + password; `@supabase/ssr` 0.12.7 cookie sessions | Owner and manager are real users; guests are not | [Supabase Next.js SSR](https://supabase.com/docs/guides/auth/server-side/nextjs) |
| Files | Supabase Storage: private buckets, signed upload URLs | Uploads skip Vercel's 4.5 MB request body limit | [createSignedUploadUrl](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) |
| Live updates | Version poll every 2.5 s plus `router.refresh()`; optional Realtime Broadcast "doorbell" | Does not depend on WebSockets over venue Wi-Fi | section 6.5 |
| Validation | zod 4.6.7 | One schema per write action, shared by forms, voice and APIs | [Zod 4 changelog](https://zod.dev/v4/changelog) |
| UI | shadcn 4.23.0 with `--base radix`, Tailwind 4.3.3 | shadcn switched its default base to Base UI on 2026-07-02 | [shadcn changelog](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default) |
| Card export | puppeteer-core 25.11.0 + @sparticuz/chromium 153.0.0 | Real Devanagari shaping | section 7 |
| Jobs | Postgres table + `after()` + two ops endpoints | No queue infrastructure; NudgeBee is the orchestrator | section 9 |
| Sponsors | sarvamai 1.1.22 (server only); flagsmith-nodejs 8.1.2 and flagsmith 10.0.0 | From the sponsor research | [npm sarvamai](https://www.npmjs.com/package/sarvamai) |

### Next.js 16 facts that shape the code

- **Upgrade-guide changes** (source: [version-16 guide](https://unpkg.com/next@16.4.6/dist/docs/01-app/02-guides/upgrading/version-16.md)):
  - Requires Node 20.9+ and TypeScript 5.1+.
  - Turbopack is the default for both dev and build.
  - `cookies()`, `headers()`, `params` and `searchParams` are async only.
  - `middleware.ts` is now `proxy.ts`, and it runs on Node.
  - `next lint` is removed.
  - `next dev` writes to `.next/dev`, and a lockfile prevents two `next dev` runs in the same folder.
- **Runtime.** Node is the default; the Edge runtime is deprecated ([runtime](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md)). postgres.js, the Sarvam SDK and Chromium all need Node anyway.
- **Cache Components: turn them off (judgement).**
  - create-next-app 16.4.6 enables them by default ([create-next-app source](https://github.com/vercel/next.js/tree/v16.4.6/packages/create-next-app)).
  - With them on, reading `cookies()` outside a Suspense boundary is a build error ([authentication with Cache Components](https://unpkg.com/next@16.4.6/dist/docs/01-app/02-guides/authentication-with-cache-components.md)).
  - With them on, the `runtime` segment export is not allowed ([cacheComponents](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md)).
  - Every planner page reads the session cookie, so they add little and cost build errors.
- **`proxy.ts` location.** With a `src` directory it goes in `src/`, next to `app` ([proxy](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)).
- **`after()`.** On Vercel it uses `waitUntil` and is bounded by the route's `maxDuration` ([after](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/04-functions/after.md)).
- **`router.refresh()`.** Re-renders server components and keeps client state ([useRouter](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/04-functions/use-router.md)).
- **Env files in config.** Load env files in ORM config with `loadEnvConfig` from `@next/env` ([environment variables](https://unpkg.com/next@16.4.6/dist/docs/01-app/02-guides/environment-variables.md)).

### Vercel Hobby facts

- **Functions** ([function limits](https://vercel.com/docs/functions/limitations)):
  - Fluid compute, 2 GB and 1 vCPU.
  - 300 s default and maximum duration.
  - 250 MB uncompressed bundle.
  - 4.5 MB request and response bodies.
  - One region, default `iad1`.
- **Region.** `bom1` is Mumbai (AWS ap-south-1) ([regions](https://vercel.com/docs/regions)). Set it with `"regions": ["bom1"]` in `vercel.json` ([region config](https://vercel.com/docs/functions/configuring-functions/region)).
- **Node version.** The default is 26.x; `"engines": { "node": "24.x" }` pins Node 24, which matches the laptop ([Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).
- **Account limits** ([limits](https://vercel.com/docs/limits)):
  - 1 concurrent build, 100 deployments a day, 45 minutes per build.
  - Runtime logs are kept for 1 hour.
  - A Hobby project cannot connect to a repository owned by a GitHub organization.
- **Monthly allowance.** 1,000,000 function invocations, 4 h of active CPU and 360 GB-hours of provisioned memory ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)).
- **Deployment Protection.** Standard Protection covers every deployment URL except production domains, and you cannot use `VERCEL_URL` with it ([deployment protection](https://vercel.com/docs/deployment-protection)).
- **Production URL.** `VERCEL_PROJECT_PRODUCTION_URL` is always set and has no protocol ([system env vars](https://vercel.com/docs/environment-variables/system-environment-variables)). Phones, NudgeBee and the Chromium renderer should all use the production domain.

### Supabase vs Neon + Better Auth + Vercel Blob

| Criterion | Supabase (recommended) | Neon + Better Auth + Blob (fallback) |
|---|---|---|
| Setup time (estimate) | About 10 min tonight (account, project, copy keys); about 5 min at 09:00 (env vars) | About 5 min to provision through the Marketplace at 09:00, plus about 30–45 min of code for Better Auth routes and tables and Blob client uploads |
| Region | Mumbai, ap-south-1 ([regions](https://supabase.com/docs/guides/platform/regions)) | No India region; nearest is Singapore, aws-ap-southeast-1 ([Neon regions](https://neon.com/docs/introduction/regions)) |
| "Manager's change on the owner's screen" | Poll, plus an optional Broadcast doorbell sent with `httpSend` ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast)) | Poll only; Neon's realtime option was not verified |
| Guest-link security | Token checked on the server (same design either way) | Same |
| Free tier | 2 active projects; 500 MB database; 1 GB storage; 50 MB max file; 5 GB egress; 50k MAU; Realtime 200 connections and 2M messages; pauses after a week idle ([pricing](https://supabase.com/pricing)) | Neon Free: 100 CU-hours, 5 GB transfer, 60k Auth MAU ([Neon plans](https://neon.com/docs/introduction/plans)). Blob on Hobby: 1 GB, 10k simple and 2k advanced operations, 10 GB transfer; going over blocks access for 30 days ([Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)) |
| One schema for four sessions | Drizzle schema and migrations, owned by Lane A | Same |
| Provisioning | Dashboard, tonight (details below this table) | The Marketplace syncs `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PG*` and `NEON_AUTH_*` ([Neon Vercel integration](https://neon.com/docs/guides/vercel-managed-integration)) |
| Idle behaviour | Pauses after a week idle, which doesn't matter today | Compute scales to zero after 5 min idle, and Free can't disable that ([Neon plans](https://neon.com/docs/introduction/plans)) |
| Create tonight? | Yes, as an empty project | No; it takes minutes at 09:00 if needed |

Supabase provisioning details:
- The Supabase CLI isn't needed. Version 3.4.0 came out on 2026-11-24, and its local stack needs Docker, which isn't running on the laptop.
- The Vercel Marketplace route creates a separate Vercel-managed Supabase organization and syncs 13 env vars. Whether it offers the free plan is unknown ([Marketplace](https://supabase.com/docs/guides/integrations/vercel-marketplace)).

### Why Drizzle, and not Prisma or supabase-js, for data

- **Connection setting.** Drizzle with postgres.js on the transaction pooler needs `prepare: false` ([Drizzle + Supabase](https://orm.drizzle.team/docs/connect-supabase)), because transaction mode has no prepared statements ([Supabase connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)).
- **Pin `postgres@3.4.9`.** v4.0.0 (2026-10-29) is a rewrite, and the Drizzle issue about it is still open ([drizzle-orm #6686](https://github.com/drizzle-team/drizzle-orm/issues/6686)).
- **Use drizzle-orm 0.45.4** (npm `latest`), not 1.0.0-rc.6 (published 2026-11-20). The docs site already shows v1, which differs:
  - Migrations are one folder per migration instead of `meta/_journal.json` ([upgrade to v1](https://orm.drizzle.team/docs/upgrade-v1)).
  - RLS uses `withRLS` instead of `.enableRLS()` ([RLS](https://orm.drizzle.team/docs/rls)).
- **How agents should cope with the v1 docs (judgement).**
  - When an example from the site doesn't compile, check the types in `node_modules/drizzle-orm`.
  - Prefer the core query builder with explicit joins over the relational `db.query` API.
- **Generate and migrate, don't push.**
  - `drizzle-kit push` is "the best approach for rapid prototyping" and diffs against the live database ([migrations](https://orm.drizzle.team/docs/migrations)).
  - That suits one person. With four sessions sharing one database, use `generate` + `migrate`, run from Lane A only (judgement).
- **Prisma: too many moving parts for a 6-hour build (judgement).**
  - On npm, `prisma@latest` is 8.0.0-rc.35 while `@prisma/client@latest` is 7.10.1.
  - Prisma 7 needs a driver adapter, `prisma.config.ts` and an explicit `output`. It ships as ESM and doesn't load env files itself ([Prisma 7 upgrade](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)).
- **supabase-js for data: no client-side transactions.** The usual answer is SQL functions called through RPC ([discussion #526](https://github.com/supabase/supabase/discussions/526)). A ledger correction has to do four things atomically:
  - update the payment
  - append the history row
  - write the activity line
  - bump the version

### Gotchas for AI coders (copy into AGENTS.md)

- **Zod 4** ([changelog](https://zod.dev/v4/changelog)):
  - `error` replaces `message`.
  - String formats are top-level, as in `z.email()`. `z.uuid()` is stricter; use `z.guid()` for any UUID-shaped string.
  - `z.record` needs two arguments.
  - Use `z.strictObject` and `z.looseObject`.
  - `.default()` short-circuits; `.prefault()` gives the old behaviour.
  - Use `z.treeifyError`, and `.issues` instead of `.errors`.
- **Tailwind v4** ([upgrade guide](https://tailwindcss.com/docs/upgrade-guide)):
  - Use `@import "tailwindcss"`. Tokens live in CSS `@theme`, and a JS config is not auto-detected.
  - Renamed utilities: `shadow-sm` → `shadow-xs`, `rounded-sm` → `rounded-xs`, `outline-none` → `outline-hidden`, `ring` → `ring-3`.
  - The default border colour is `currentColor`.
  - Requires Safari 16.4+, Chrome 111+ or Firefox 128+.
- **shadcn on Tailwind v4** ([shadcn Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)): `tw-animate-css`, `@theme inline`, OKLCH colours, `data-slot` attributes, no `forwardRef`, and `sonner` replaces `toast`.
- **Stay on TypeScript 5.9.3** (the template's `^5`). npm `latest` is 7.0.2, and Next's docs say "TypeScript 7 does not currently provide the JavaScript compiler API" ([Next TypeScript](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/05-config/02-typescript.md)).
- **Stay on ESLint 9.39.5** (the template's `^9`); 10.15.0 is latest.
- **Stay on Tailwind 4.3.3.** create-next-app pins it because 4.3.4 had a CJS/ESM bug ([create-next-app source](https://github.com/vercel/next.js/tree/v16.4.6/packages/create-next-app)); 4.3.5 is the latest.
- **`server-only` throws in plain Node.** It throws unless the module is resolved under the `react-server` condition ([package.json](https://unpkg.com/server-only@0.0.1/package.json), [index.js](https://unpkg.com/server-only@0.0.1/index.js)). As a result:
  - Scripts run with `tsx` must not import files that contain it, so keep it out of `src/db/*`.
  - Vitest needs `server-only` aliased to an empty module.

---

## 3. Fallback

**When to switch.** By 09:30, if any of these is true:
- the Supabase project isn't ready, or
- the pooler connection fails twice, or
- creating an admin user fails twice.

| Concern | Recommended | Fallback |
|---|---|---|
| Postgres | Supabase, Mumbai | Neon through the Vercel Marketplace, in Singapore ([Neon regions](https://neon.com/docs/introduction/regions)) |
| Driver | postgres 3.4.9 with `prepare: false` | Same driver: pooled `DATABASE_URL` at runtime, `DATABASE_URL_UNPOOLED` for migrations ([Neon Vercel integration](https://neon.com/docs/guides/vercel-managed-integration)) |
| Auth | Supabase Auth | better-auth 1.7.28 + @better-auth/drizzle-adapter 1.7.28; see the notes below this table |
| Files | Supabase Storage signed uploads | @vercel/blob 2.9.0 client uploads with `BLOB_READ_WRITE_TOKEN` ([Vercel Blob](https://vercel.com/docs/vercel-blob)) |
| Live updates | Poll + optional Broadcast | Poll only |
| Cold start | n/a | Neon Free scales to zero after 5 min idle ([Neon plans](https://neon.com/docs/introduction/plans)); the first query after idle is slower, by an unknown amount |

Better Auth setup for the fallback:
- `app/api/auth/[...all]/route.ts` with `toNextJsHandler`.
- `auth.api.getSession({ headers: await headers() })` on the server ([Better Auth + Next](https://www.better-auth.com/docs/integrations/next)).
- Generate the tables with `npx auth@1.7.28 generate` ([Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)).
- Env vars: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` ([installation](https://www.better-auth.com/docs/installation)).
- Neon Auth is itself built on Better Auth ([Neon Auth](https://neon.com/docs/auth/overview)).

**What stays the same:** contracts, services, authorization, UI, voice, flags, export and jobs. This only holds if lanes call `src/server/auth` and `src/server/storage` instead of calling Supabase directly. Lane A owns both modules.

**Export fallback (separate from the database decision).**
- When: production Chromium export not working by 12:15.
- What: set the flag `card_renderer=og` to switch to `next/og`, which is already inside Next.
  - Dynamic text is Latin only.
  - The Hindi lines become a pre-rendered image in `public/`, made by screenshotting the render page in local Chrome.
  - Output is PNG only.
- README: mark PDF output and dynamic Hindi on the card as Partial.

**Hosting fallback.**
- When: Vercel is unusable.
- What: run `next start` on the laptop behind a Cloudflare quick tunnel.
- Tunnel limits ([Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)):
  - HTTPS with a random hostname.
  - No account needed.
  - No uptime guarantee.
  - 200 in-flight requests.
  - No server-sent events.

---

## 4. Bill of materials

Install everything at 09:07 from the main worktree, before any lane branches (section 11). The lockfile is the real pin: lanes run `npm ci`, never `npm install`.

### Runtime dependencies

| Package | Exact version | Used for | Lane | Note |
|---|---|---|---|---|
| next | 16.4.6 | framework | lead | from create-next-app |
| react, react-dom | 19.3.0 | UI | lead | template pin; 19.3.1 exists, don't bump mid-day |
| @supabase/supabase-js | 2.119.2 | Auth admin, Storage, optional Broadcast | A | `httpSend` needs 2.76 or later ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast)) |
| @supabase/ssr | 0.12.7 | cookie sessions in server components, route handlers and proxy | A | |
| drizzle-orm | 0.45.4 | schema and queries | A | not 1.0.0-rc.6 |
| postgres | 3.4.9 | Postgres driver | A | not 4.x ([#6686](https://github.com/drizzle-team/drizzle-orm/issues/6686)) |
| zod | 4.6.7 | contracts | lead | |
| sarvamai | 1.1.22 | speech-to-text and text-to-speech, server side | C | chat completions and Document AI use plain `fetch` |
| flagsmith-nodejs | 8.1.2 | server-side flags and the kill switch | C | |
| flagsmith | 10.0.0 | browser SDK, only if client-side evaluation is needed | C | |
| puppeteer-core | 25.11.0 | drives Chromium | D | targets Chrome 153 ([revisions](https://unpkg.com/puppeteer-core@25.11.0/src/revisions.ts)); downloads no browser |
| @sparticuz/chromium | 153.0.0 | Linux Chromium on Vercel | D | about 70 MB; engines `node ^22.17 \|\| >=24`. 158.0.0 was published 2026-11-24; don't take it |
| server-only | 0.0.1 | build-time guard for server modules | lead | |

`shadcn init` and `shadcn add` install their own dependencies with caret ranges, and the lockfile then fixes them. Today's npm latest for each:

| Package | Latest today |
|---|---|
| radix-ui | 1.8.1 |
| class-variance-authority | 0.7.1 |
| clsx | 2.1.1 |
| tailwind-merge | 3.7.1 |
| lucide-react | 1.79.0 (publishes almost daily) |
| sonner | 2.0.8 |
| tw-animate-css | 1.4.0 |

### Dev dependencies

| Package | Exact version | Note |
|---|---|---|
| typescript | 5.9.3 | what the template's `^5` resolves to; not 7.0.2 |
| @types/node | 24.19.2 | the template has `^20`; bump it to match Node 24 |
| @types/react, @types/react-dom | 19.3.1, 19.3.0 | |
| eslint, eslint-config-next | 9.39.5, 16.4.6 | not ESLint 10 |
| tailwindcss, @tailwindcss/turbopack | 4.3.3, 4.3.3 | create-next-app's pins; there is no PostCSS config |
| drizzle-kit | 0.31.11 | pairs with drizzle-orm 0.45 |
| @next/env | 16.4.6 | loads `.env.local` in `drizzle.config.ts` and scripts |
| tsx | 4.23.15 | runs `scripts/seed.ts` |
| vitest | 5.1.1 | optional: ledger, permission and idempotency tests |

### Global tools

| Tool | Version | Install |
|---|---|---|
| Vercel CLI | 66.6.0 | `npm i -g vercel@66.6.0` ([CLI](https://vercel.com/docs/cli)) |
| cloudflared | 2026.11.2 | `brew install cloudflared` ([formula](https://formulae.brew.sh/formula/cloudflared)) |
| gh | already installed and logged in | |
| Node, npm | v24.19, 11.17 | already installed |

Not needed: pnpm, bun, Docker and the Supabase CLI.

### Fallback only

- better-auth 1.7.28 and @better-auth/drizzle-adapter 1.7.28
- @vercel/blob 2.9.0
- satori 0.63.2 with @resvg/resvg-js 2.6.2, only if `next/og` is not enough

### Considered and not used

| Package | Reason |
|---|---|
| @prisma/client 7.10.1 / prisma 8.0.0-rc.35 | Tag mismatch and Prisma 7 setup (section 2) |
| @react-pdf/renderer 4.9.1 | Indic shaping (section 7) |
| html-to-image 1.11.13, modern-screenshot 4.7.0 | Client-side capture caveats (section 7) |
| @tanstack/react-query 5.108.4 | The poll hook is about 20 lines (estimate) |
| workflow 5.8.0, @vercel/queue 0.11.0 | More infrastructure than one job type needs (section 9) |
| drizzle-zod 0.8.3 | Contract-first zod schemas read better for voice actions (judgement) |

---

## 5. Repo layout and lane ownership

```
.                                       owner
├── AGENTS.md                           lead   Next's managed block + our rules below it
├── CLAUDE.md                           lead   one line: @AGENTS.md
├── README.md                           lead   setup, AI disclosure, Working / Partial / Future
├── .env.example                        lead
├── next.config.ts, vercel.json         lead
├── package.json, package-lock.json     lead   lanes never install
├── drizzle.config.ts                   A
├── drizzle/                            A      generated SQL migrations, append-only
├── scripts/seed.ts                     A      fictional wedding, demo users, buckets (idempotent)
├── docs/prep/                          lead   these notes
└── src/
    ├── proxy.ts                        A      Supabase session refresh only
    ├── contracts/                      lead   written first, 09:30–09:50
    ├── db/                             A      schema.ts, client.ts
    ├── lib/supabase/                   A      server.ts, browser.ts, admin.ts
    ├── server/
    │   ├── auth/ authz/ services/ activity/ live/ storage/    A
    │   ├── voice/ flags/                                      C
    │   └── invite/ export/ jobs/                              D
    ├── components/
    │   ├── ui/                         lead   shadcn output; nobody regenerates it
    │   ├── live/                       A      useVersionPoll
    │   ├── planner/                    B
    │   ├── voice/                      C      VoiceDock
    │   └── invite/                     D
    └── app/
        ├── layout.tsx, globals.css                     lead
        ├── (auth)/login/                               A
        ├── (planner)/w/[weddingId]/...                 B   dashboard, events, guests, vendors, money, activity
        ├── (planner)/w/[weddingId]/invite/             D   studio, publish, export button
        ├── (planner)/setup/                            C   voice-first and form-first setup
        ├── (public)/i/[token]/                         D   guest invitation and RSVP
        ├── render/card/[publicationId]/                D   the page Chromium screenshots
        └── api/
            ├── w/[weddingId]/version/                  A
            ├── uploads/sign/                           A
            ├── voice/...                               C
            ├── i/[token]/revision/                     D
            ├── exports/                                D
            └── ops/jobs/[id]/  and  [id]/retry/        D
```

### Lanes

| Lane | Branch | Worktree | Dev port |
|---|---|---|---|
| Lead | `main` | repo root | 3000 |
| A: data and roles | `lane-a-data` | `../jashn-a` | 3001 |
| B: planning screens | `lane-b-planner` | `../jashn-b` | 3002 |
| C: voice + Flagsmith | `lane-c-voice` | `../jashn-c` | 3003 |
| D: invitation, RSVP, export + NudgeBee | `lane-d-invite` | `../jashn-d` | 3004 |

What each lane delivers first, by about 10:30:
- **Lead:**
  - Scaffold, contracts and first deploy.
  - Merges every 45–60 minutes.
- **Lane A:**
  - Schema, the first migration and seed data.
  - Sign-in for the owner and the manager.
  - `applyAction`.
  - The version endpoint and poll hook.
  - Signed uploads.
- **Lane B:**
  - Dashboard, events, guests, vendors and the money ledger, plus the activity feed.
  - Built on the fixtures first, then on A's services.
- **Lane C:**
  - VoiceDock: record, transcribe, propose, then confirm through `applyAction`.
  - The `setup_entry` split and the `voice_writes_enabled` kill switch.
- **Lane D:**
  - The publish snapshot, the guest page and RSVP.
  - The render page and the Chromium export.
  - The job and retry endpoints.

### Lane rules

1. **The lead writes `src/contracts/*`**, commits it to `main`, and only then creates the worktrees. Contracts change only on `main`, by the lead; lanes pick changes up with `git merge main`.
2. **Each lane edits only its own paths.** These shared files belong to the lead:
   - `package.json` and the lockfile
   - `layout.tsx` and `globals.css`
   - `components/ui`
   - `next.config.ts` and `vercel.json`
   - `AGENTS.md`
3. **Only Lane A edits `src/db/schema.ts`** and runs `db:generate` and `db:migrate` against the one shared database.
   - Nobody runs `drizzle-kit push`.
   - After about 11:00, migrations are additive only (no renames, no drops), so older lane branches keep working.
4. **Other lanes may query A's tables from their own `src/server/*` modules.** If a lane needs a new column, it asks Lane A.
5. **Until A's services land, B, C and D code against the fixtures.** They use the interfaces in `src/contracts/services.ts` with the fixture implementation. Switching to the real services is a one-line change in `src/server/services/index.ts`, owned by A.
6. **Merge every 45–60 minutes, in order A → B → C → D.** Run `npm ci && npm run typecheck && npm run build` on `main`, then push. Vercel Hobby builds one deployment at a time ([limits](https://vercel.com/docs/limits)).
7. **Lane branches are named `lane-*`.** `vercel.json` turns off Git deployments for them, so only `main` deploys ([git configuration](https://vercel.com/docs/project-configuration/git-configuration)).

### Contracts module (lead, 09:30–09:50)

| File | Contents |
|---|---|
| `domain.ts` | Branded IDs. `Role` (owner or manager). RSVP status. DTO types `OwnerView`, `ManagerView` and `GuestView`; `GuestView` has no money fields, by construction. `ActivityItem`. |
| `money.ts` | `Paise` (integer); rupee/paise conversion; `formatINR` with Indian grouping (₹1,50,000); `outstanding(commitment, payments)` |
| `actions.ts` | A zod discriminated union of every write (`event.update`, `payment.record`, `payment.correct`, `guest.add`, `rsvp.set`, ...) and `ActionResult`. Forms and voice proposals both produce these. |
| `permissions.ts` | The role × capability table and `can()` |
| `services.ts` | Signatures for `applyAction(actor, action, idempotencyKey)`, `getOwnerView`, `getManagerView`, `publish`, `getGuestView(token)`, `recordRsvp(token, ...)` and `createSignedUpload(...)`, plus a fixture implementation |
| `routes.ts` | URL builders for every page and API path |
| `flags.ts` | Flag keys and safe defaults: `setup_entry`, `voice_pilot`, `voice_writes_enabled`, `spoken_replies`, `voice_tts_enabled`, `image_extraction_provider`, `stt_mode`, `card_renderer`, `export_failure_drill` |
| `jobs.ts` | Job status, format and error-code enums, and the ops API response type |
| `fixtures.ts` | The fictional wedding from the plan's data sheet, as DTOs |

### AGENTS.md and CLAUDE.md

**AGENTS.md.**
- create-next-app writes a managed block, and `next dev` rewrites only the text between `<!-- BEGIN:nextjs-agent-rules -->` and `<!-- END:nextjs-agent-rules -->` ([create-next-app source](https://github.com/vercel/next.js/tree/v16.4.6/packages/create-next-app)).
- Add our rules below the block:
  1. **Next.js API use.** This is Next 16.4.6. Read `node_modules/next/dist/docs/` before using any Next.js API.
  2. **Runtime and caching.**
     - Node runtime only; never `runtime = 'edge'`.
     - Cache Components are off, so never add `'use cache'`.
  3. **Async request APIs.**
     - Use `await cookies()`, `await headers()` and `await params`.
     - Session refresh lives in `src/proxy.ts`.
  4. **Reads, writes and server-only code.**
     - Every write goes through `applyAction` with a zod-validated action and an idempotency key.
     - Every page read goes through a view function that returns a DTO.
     - Files in `src/server/**` start with `import 'server-only'`, and no `'use client'` file imports them.
  5. **Money.** Money is integer paise. Format it only with `formatINR`.
  6. **Drizzle 0.45.** Use the core query builder with explicit joins, not `db.query`. The docs site shows v1 syntax.
  7. **Library versions.** Follow the Zod 4, Tailwind v4 and shadcn (Radix) notes in section 2 of this document.
  8. **Forbidden in a lane:** `npm install`, `npx shadcn add`, `drizzle-kit push`, and anything `@latest`.
  9. **Lane boundaries.** Stay inside your lane's paths (see `CLAUDE.local.md`), and ask the lead for anything else.
  10. **Commits.** Commit small, and end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**CLAUDE.md.**
- It contains one line: `@AGENTS.md`.
- Claude Code reads AGENTS.md only when there is no CLAUDE.md, and CLAUDE.md can import files with `@path` ([Claude Code memory](https://code.claude.com/docs/en/memory)).
- Each worktree also gets a gitignored `CLAUDE.local.md` with its lane brief: owned paths, first deliverable and port.

---

## 6. Data, auth, realtime and files

### 6.1 Database connections

| Use | Env var | Supabase string | Port | Driver options |
|---|---|---|---|---|
| App at runtime (Vercel and local dev) | `DATABASE_URL` | Transaction pooler (Supavisor) | 6543 | `postgres(url, { prepare: false })` |
| Migrations and seed (laptop only) | `MIGRATION_DATABASE_URL` | Session pooler | 5432 | defaults |

- **Hosts and IPv6.** The direct connection host is IPv6-only, so migrations go through the session pooler. Copy both pooler strings from the dashboard's Connect dialog; the host looks like `aws-[INDEX]-[REGION].pooler.supabase.com` ([connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)).
- **Client pooling.**
  - Use one postgres.js client per server instance, at module scope.
  - In dev, cache it on `globalThis` so hot reloads don't open new pools.
  - Keep `max` small; about 5 is an estimate. The Free plan's pooler limits are unknown.

```ts
// drizzle.config.ts (Lane A)
import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'

loadEnvConfig(process.cwd())

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL! },
})
```

```ts
// src/db/client.ts (Lane A). No 'server-only' here: the seed script imports it.
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

const client = postgres(process.env.DATABASE_URL!, { prepare: false })
export const db = drizzle({ client })
```

### 6.2 Schema conventions (Lane A writes the schema; the contracts name the tables)

- **Put every table in a Postgres schema called `app`**, declared with `pgSchema('app')`. Why:
  - Supabase's Data API exposes only `public` by default. A custom schema must be added to the exposed list and granted before the API can reach it ([custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas)).
  - A table in `public` without RLS can be read and written by any role that has a grant ([RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)). That includes requests made with the publishable key, which ships to browsers.
  - Our server connects as `postgres`, which bypasses RLS (same page), so nothing else changes.
- **Money is stored as integer paise**, using `bigint` in number mode. ₹2,00,000 is 2,00,00,000 paise.
- **Payments: one row each, with `amount_paise` and `revision`.**
  - A correction runs `UPDATE ... SET amount_paise = $new, revision = revision + 1 WHERE id = $id AND revision = $expected`.
  - In the same transaction, it appends a `payment_revisions` row and an `activity` row, and bumps the version.
  - If zero rows update, return 409 ("changed by someone else").
  - Outstanding is computed on read as commitment minus the sum of payments. With the brief's numbers: ₹2,00,000 − ₹50,000 = ₹1,50,000, and after correcting the advance to ₹40,000 it becomes ₹1,60,000.
  - The catering estimate is attending × per-plate: 230 × ₹800 = ₹1,84,000.
- **`weddings.version` is the poll cursor.** It is a `bigint`, incremented in the same transaction as every write and its activity row.
- **`applied_actions` makes repeated requests safe.** Columns: `idempotency_key` (primary key), `wedding_id`, `action jsonb`, `result jsonb`, `created_at`.
  - The client creates the key when it shows a confirmation (a form submit or a voice proposal).
  - The service inserts the key inside the write transaction.
  - On a unique violation, the service returns the stored result instead of writing again.
  - This covers the brief's "repeated requests" check.
- **`publications` snapshot what guests see.** Columns: `id`, `wedding_id`, `revision`, `snapshot jsonb`, `published_at`, `published_by`.
  - Publish copies the guest-visible fields of the current draft into a new snapshot.
  - Guests only ever read the latest snapshot, so drafts cannot leak.
- **`activity.summary` stores the readable line at write time**, for example "Diya moved the reception from Garden Hall to Lotus Hall".

### 6.3 Authentication

- **Email and password only.** No magic links: the built-in email sender allows 2 emails an hour, and Auth rate limits are per IP ([rate limits](https://supabase.com/docs/guides/auth/rate-limits)).
- **Turn off email confirmation.** Hosted projects require it by default ([passwords](https://supabase.com/docs/guides/auth/passwords)).
- **Create the demo users on the server.** Seed them with `auth.admin.createUser({ email, password, email_confirm: true })`, using the secret key ([createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)).
- **Sessions** ([Next.js SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs)):
  - Sessions live in `@supabase/ssr` cookies, and `src/proxy.ts` refreshes them.
  - Server code calls `supabase.auth.getClaims()`.
  - Never trust `getSession()` on the server.
- **Keys** ([API keys](https://supabase.com/docs/guides/api/api-keys)):
  - `sb_publishable_...` is the browser key.
  - `sb_secret_...` is the server key; browsers get a 401 with it.
  - The legacy anon and service_role keys are deprecated by the end of 2026.
- **Sign-in is a server action** that calls `signInWithPassword` on the server client. No browser Supabase client is needed for auth (judgement).
- **Second session.** Mira (owner) uses the laptop, and Diya (manager) uses the phone or a second Chrome profile. This covers the brief's "persists across refresh and a second session" check.

### 6.4 Authorization and guest links (server token, not RLS)

- **One module, `src/server/authz`.** `requireMember(weddingId, capability)` runs four steps:
  1. Read the claims.
  2. Load the membership.
  3. Check `can(role, capability)`.
  4. Throw 403 if the check fails.

  Every service calls it first. This is Next's Data Access Layer pattern: a `server-only` module that checks authorization and returns minimal DTOs ([data security](https://unpkg.com/next@16.4.6/dist/docs/01-app/02-guides/data-security.md)).
- **Guest link: `/i/<token>`** (judgement throughout).
  - The token is 32 random bytes in base64url (`crypto.randomBytes(32).toString('base64url')`, 43 characters).
  - Store only its SHA-256 hash, in `invitations.token_hash` (unique). Look tokens up by hash, and set `revoked_at` to revoke a link.
  - With 256 random bits, a fast hash is enough.
- **What the guest page shows.**
  - It builds a `GuestView` from the latest publication snapshot only, filtered to the events in that guest's `invitation_events`.
  - It never imports the money services.
- **RSVP.** It accepts only event IDs from that list, and it upserts on `(invitation_id, event_id)` so repeated RSVPs don't create duplicates.
- **Headers on `/i/*`.** Send `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`, using `headers()` in `next.config.ts` ([headers](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md)).
- **Why not RLS for guests.**
  - A guest has no Supabase user. RLS would need either anonymous sign-ins, which are rate-limited per IP ([rate limits](https://supabase.com/docs/guides/auth/rate-limits)), or custom JWTs.
  - It would also need policies on every table, which four sessions would be maintaining at once.
  - A server-checked token keeps the whole check in one function that can be tested.
- **Tests, as Tara.** These come from the brief and the plan's risk 5:
  - An uninvited event is absent.
  - The Lotus Hall draft is invisible until Publish.
  - The DTO type has no money fields.
  - An RSVP for an uninvited event returns 403.
  - A revoked token returns 404.

### 6.5 Live updates: polling first, Realtime optional

- **Baseline: `useVersionPoll`** (Lane A, in `src/components/live`).
  - It fetches `GET /api/w/[weddingId]/version` every 2.5 s while `document.visibilityState === 'visible'`, and again on window focus.
  - When the number changes it calls `router.refresh()` ([useRouter](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/04-functions/use-router.md)).
  - The route reads one row and returns `Cache-Control: no-store`.
- **Guests** use the same hook on `GET /api/i/[token]/revision`, so Tara's phone switches to Lotus Hall soon after Mira publishes.
- **Delay.** One poll interval plus one render, roughly 1–4 s (estimate).
- **Cost (estimate).** 4 open screens × 0.4 requests/s × 6 h ≈ 35,000 invocations. Hobby allows 1,000,000 a month ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)).
- **Why Realtime is not the primary path.**
  - It adds a long-lived WebSocket on venue Wi-Fi and phones.
  - Supabase documents silent disconnects in background tabs, and recommends `worker: true` plus a `heartbeatCallback` ([silent disconnects](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794)).
  - Whether the venue network blocks WebSockets is unknown.
- **Optional doorbell** (add only after polling works):
  - After a commit, the server sends a Broadcast message `{ version }` on the topic `wedding:<id>` using `channel.httpSend()`, which needs no subscribe ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast)).
  - Subscribed clients refresh immediately, and polling stays on as the safety net.
  - The payload is a single number.
  - Free-plan limits: 100 messages/s and 256 KB payloads ([Realtime limits](https://supabase.com/docs/guides/realtime/limits)).
  - Private channels need RLS policies on `realtime.messages` ([Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)). The default of the "Allow public access" setting is unknown, so check it in the dashboard.

### 6.6 Files

- **Buckets.** Two private buckets, which Lane A's seed creates:
  - `uploads`: invitation photos and images for extraction.
  - `exports`: card PNGs and PDFs.
- **Upload flow.**
  1. A server action checks the user's role.
  2. It calls `createSignedUploadUrl(path)`; the URL is valid for 2 hours ([reference](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)).
  3. The browser uploads straight to Storage.
  4. The server records the path.

  Files never pass through a Vercel function, so the 4.5 MB body limit doesn't apply ([function limits](https://vercel.com/docs/functions/limitations)). Phone photos are often several MB (estimate).
- **Downloads.** Use short-lived signed URLs. Never stream a card through a function, because the 4.5 MB limit applies to responses too.
- **Audio is the exception.** A clip of up to 25 s posts directly to `/api/voice/*` as multipart. At speech bitrates it is a few hundred KB (estimate).

---

## 7. Card export

| Option | Devanagari shaping | Runs on Vercel | Verdict |
|---|---|---|---|
| `next/og` `ImageResponse` | **No.** Next 16.4.6 bundles @vercel/og 1.0.1, which pins satori 0.29.0 ([package.json](https://unpkg.com/next@16.4.6/dist/compiled/@vercel/og/package.json)). HarfBuzz shaping arrived in satori 0.33.0 ([PR #735](https://github.com/vercel/satori/pull/735)). | Yes, with nothing to install | Fallback only, Latin text |
| satori 0.63.2 + resvg | **Partly.** It has HarfBuzz, but the Indic issue is still open ([#215](https://github.com/vercel/satori/issues/215)) and the fix for reversed mark offsets is unmerged ([PR #880](https://github.com/vercel/satori/pull/880)). About 40 releases in two months. | Yes | Untested risk; not the primary |
| @react-pdf/renderer 4.9.1 | **Doubtful.** Indic issues were closed, but reports continued afterwards ([#454](https://github.com/diegomura/react-pdf/issues/454)); an Arabic shaping bug is open ([#3555](https://github.com/diegomura/react-pdf/issues/3555)) | Yes | Avoid for Hindi |
| Headless Chromium: puppeteer-core 25.11.0 + @sparticuz/chromium 153.0.0 | **Yes.** It lays text out with the same browser engine that displays the page (judgement) | Yes. Vercel has a guide ([Puppeteer on Vercel](https://vercel.com/guides/deploying-puppeteer-with-nextjs-on-vercel)), and it fits in 2 GB / 250 MB | **Primary** |
| Client-side capture (html-to-image, modern-screenshot) | Uses the viewer's browser | n/a | Not for the canonical file. Safari can draw a blank first frame ([html-to-image](https://github.com/bubkoo/html-to-image)), and partial embedding fails on CORS ([modern-screenshot](https://github.com/qq15725/modern-screenshot)) |

playwright-core would work with the same Chromium package ([Sparticuz README](https://github.com/Sparticuz/chromium)), and Next auto-externalizes `playwright-core` too ([serverExternalPackages](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md)). Puppeteer is chosen because Vercel's guide and the README's main examples use it, and because its Chrome version matches this Chromium release (judgement).

### Implementation (Lane D)

1. **Render page: `src/app/render/card/[publicationId]/page.tsx`.**
   - A print-only page that reads the publication snapshot.
   - Fixed size; 1080×1350 CSS px is a reasonable phone-share size (judgement).
   - Requires `?t=`, an HMAC of the publicationId and an expiry, signed with `RENDER_TOKEN_SECRET`.
   - Marked noindex.
2. **Fonts: `next/font/google` with the `devanagari` subset**, so our own app serves the font files.
   - Families with a Devanagari subset in Next 16.4.6 ([font-data.json](https://unpkg.com/next@16.4.6/dist/compiled/@next/font/dist/google/font-data.json)):
     - Tiro Devanagari Hindi
     - Noto Serif Devanagari, Noto Sans Devanagari
     - Yatra One, Rozha One
     - Kalam, Martel, Mukta, Poppins, Hind
     - Amita, Laila, Eczar, Gotu, Khand
   - Cormorant Garamond and Playfair Display have no Devanagari subset.
   - Sparticuz Chromium ships only Open Sans (Latin, Greek, Cyrillic) ([README](https://github.com/Sparticuz/chromium)), so every Hindi glyph must come from web fonts.
3. **One browser per server instance.** Keep it behind a module-level promise and run one export at a time. Concurrent launches inside one Fluid compute instance can fail with `spawn ETXTBSY` ([#507](https://github.com/Sparticuz/chromium/issues/507)).
4. **Launch call.** Use the one from the README:

   ```ts
   puppeteer.launch({
     args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
     executablePath: await chromium.executablePath(),
     headless: 'shell',
   })
   ```

   The GitHub README describes the newest release, so check `node_modules/@sparticuz/chromium/README.md` for 153.0.0.
5. **Local development.** The bundled binary is Linux-only and won't run on macOS (README). When `CHROME_EXECUTABLE_PATH` is set, launch the laptop's Chrome instead.
6. **Which URL Chromium loads.**
   - Load `https://${VERCEL_PROJECT_PRODUCTION_URL}/render/card/<id>?t=...`. The production domain is public, whereas `VERCEL_URL` is a protected deployment URL ([system env vars](https://vercel.com/docs/environment-variables/system-environment-variables), [deployment protection](https://vercel.com/docs/deployment-protection)).
   - If a protected URL is ever needed, send `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` through `page.setExtraHTTPHeaders` ([bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)).
   - Plan B if loading the URL fails: render the HTML on the server and pass it to `page.setContent` (judgement).
7. **Capture.**
   - Wait for network idle, then `await page.evaluate(() => document.fonts.ready)`.
   - PNG: `page.screenshot({ type: 'png' })` at `deviceScaleFactor: 2`.
   - PDF: `page.pdf({ width, height, printBackground: true })`.
8. **Storage.** Upload with upsert to `exports/<weddingId>/<publicationId>/<revision>.<format>`. The artifact row is unique on `(publication_id, format)`.
9. **Keep Chromium out of other routes.** Import puppeteer and chromium only inside `src/server/export/*`, using dynamic `import()` in the worker. No `next.config` entry is needed, because Next auto-externalizes both packages ([serverExternalPackages](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md)).
10. **Memory.** The README recommends at least 1600 MB; Hobby functions have 2 GB ([function limits](https://vercel.com/docs/functions/limitations)).

**First test (Lane D, first 30 minutes).**
- Render the real Hindi strings in local Chrome, then on Vercel, and compare by eye.
- Include the couple's names, "शुभ विवाह" and a line with conjuncts such as "स्वागत".

**Checkpoint at 12:15**, matching the plan's card window. If no production export of the Lotus Hall card has succeeded by then, switch to the `next/og` fallback in section 3.

---

## 8. Audio capture (push-to-talk on iOS Safari and Android Chrome)

1. **Phones need HTTPS.**
   - `getUserMedia` exists only in secure contexts; on an insecure origin, `navigator.mediaDevices` is undefined ([MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)).
   - `localhost` counts as secure on the laptop. A LAN IP opened on a phone does not ([secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)).
2. **Where the phones should point.**
   - **Default: the production deployment.** It is public HTTPS with one stable origin, so each phone grants the microphone once.
   - **Fast iteration (Lane C): a Cloudflare quick tunnel.**
     - Run `cloudflared tunnel --url http://localhost:3003` to get a random `https://*.trycloudflare.com` URL.
     - It needs no account, has no uptime guarantee, allows 200 in-flight requests and doesn't support server-sent events ([Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)).
     - Add `allowedDevOrigins: ['*.trycloudflare.com']`, or Next's dev server blocks cross-origin dev assets ([allowedDevOrigins](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md)).
     - Each new hostname is a new origin, so expect a new microphone prompt each time (inference).
   - **Not ngrok free.** It needs an account and shows an interstitial page ([ngrok limits](https://ngrok.com/docs/pricing-limits/free-plan-limits/)).
   - **Not `next dev --experimental-https`.** It makes a self-signed certificate for localhost ([next CLI](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/06-cli/next.md)), which phones won't trust (inference).
3. **Recording format.**
   - Pick with `MediaRecorder.isTypeSupported`, in this order:
     1. `audio/webm;codecs=opus`
     2. `audio/webm`
     3. `audio/mp4`
   - If none is supported, construct the recorder without `mimeType` and read `recorder.mimeType`.
   - Safari 18.4 added WebM/Opus recording ([WebKit 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)). Older iOS, from 14.3, records MP4/AAC ([WebKit MediaRecorder](https://webkit.org/blog/11353/mediarecorder-api/)).
   - Sarvam's REST speech-to-text accepts WAV, MP3, AAC, FLAC, OGG/Opus, M4A/MP4, AIFF, AMR, WMA and WebM, up to **30 seconds** per request ([Sarvam STT REST](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/rest-api)).
   - Upload the clip with a filename extension that matches its MIME type.
4. **Interaction.**
   - Tap to start and tap to stop, or hold to talk if the design wants it.
   - Show a visible timer, and stop automatically at 25 s to stay under Sarvam's 30 s limit.
   - Ask for the microphone inside the tap handler.
   - Stop every track after each clip so the recording indicator goes away.
5. **Spoken replies on iOS.**
   - Calling `play()` without a user gesture rejects with `NotAllowedError` ([MDN autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)).
   - WebKit also loses the gesture if `play()` runs after an `await` in the handler ([WebKit bug 259925](https://bugs.webkit.org/show_bug.cgi?id=259925)).
   - The fix:
     1. Create one `<audio>` element.
     2. Call `play()` on it synchronously in the stop tap, for example with a short silent clip.
     3. Reuse that element for the reply.
     4. Catch `NotAllowedError` and show a "Play reply" button instead.
   - `spoken_replies` mutes replies entirely.
6. **Test matrix.**
   - Devices: the iPhone in Safari (note its iOS version tonight), the Android phone in Chrome, and the laptop in Chrome.
   - Run each check on every device:
     1. The first permission prompt.
     2. A 5 s Hinglish clip.
     3. Playback of the reply.
     4. A second clip with no new prompt.
     5. Moving the tab to the background and back.

---

## 9. Job and retry pattern (export recovery with NudgeBee)

### Tables (Lane D; Lane A adds them to the schema)

```
export_jobs
  id uuid pk, wedding_id, publication_id, revision int, format 'png' | 'pdf'
  idempotency_key text unique          -- `${publicationId}:${format}`
  status 'queued' | 'running' | 'succeeded' | 'failed'
  attempt int default 0, max_attempts int default 3
  lease_until timestamptz null
  fail_injection 'none' | 'once' | 'consumed' default 'none'
  synthetic boolean default false
  last_error_code text, last_error text
  artifact_id uuid null, created_at, updated_at
export_artifacts   id, publication_id, format, storage_path, bytes, created_at; unique (publication_id, format)
ops_requests       idempotency_key text pk, job_id, response_status int, response_body jsonb, created_at
job_events         id, job_id, at, kind, detail jsonb, run_id text   -- the evidence timeline
```

### HTTP contract

| Endpoint | Auth | Behaviour | Responses |
|---|---|---|---|
| `POST /api/exports` with `{ publicationId, format }` | Owner session | Inserts the job with `ON CONFLICT (idempotency_key) DO NOTHING`. If the drill is on, it stamps `fail_injection = 'once'` and `synthetic = true`. It starts the worker with `after()`. | 202 `{ jobId, status }`, or 200 with the artifact if the job already succeeded |
| `GET /api/ops/jobs/:id` | `Authorization: Bearer <OPS_API_TOKEN>` | Reads the job. A `running` job whose lease has expired is marked failed with `LEASE_EXPIRED`. | 200 `{ id, status, attempt, maxAttempts, synthetic, lastErrorCode, lastError, publicationId, revision, format, artifactId, artifactUrl, updatedAt }`; 401; 404 |
| `POST /api/ops/jobs/:id/retry`, optional `?wait=25` | Bearer token plus a required `Idempotency-Key` header; optional `X-Run-Id` | Replays the stored response if the key was seen before. Otherwise it moves the job from failed to queued with a compare-and-set, starts the worker, and waits up to `wait` seconds for the result. | 202 `{ status: 'queued' or 'running' }`; 200 `{ status: 'succeeded', artifactId }` (finished within the wait, or already succeeded, which is a no-op); 409 `{ error: 'max_attempts' }`; 400 if the key is missing; 401 |

```sql
-- retry: only a failed job moves, and only once per failure
UPDATE app.export_jobs SET status = 'queued', updated_at = now()
 WHERE id = $1 AND status = 'failed' AND attempt < max_attempts
RETURNING *;

-- worker claim: exactly one worker runs a job
UPDATE app.export_jobs
   SET status = 'running', attempt = attempt + 1, lease_until = now() + interval '2 minutes'
 WHERE id = $1 AND status = 'queued'
RETURNING *;
```

### Worker steps

1. **Claim the job.** If no row comes back, exit.
2. **Drill check.** If `fail_injection = 'once'`:
   - Set `fail_injection = 'consumed'` and `status = 'failed'`.
   - Set `last_error_code = 'DRILL_INJECTED'` and `last_error = 'Deliberate failure for the recovery drill (synthetic)'`.
   - Write a `job_events` row.
   - POST to `NUDGEBEE_WEBHOOK_URL` if it is set.
   - Stop.
3. **Render and store.**
   - Render with Chromium (section 7) and upload the file.
   - Upsert the artifact.
   - Set `status = 'succeeded'` and `artifact_id`, and clear `lease_until`.
4. **On any exception:** set `status = 'failed'`, record the error code and message, and write a `job_events` row.

### Where the worker runs

- **In the same function invocation, through `after()`.** On Vercel, `after()` uses `waitUntil` and is bounded by the route's `maxDuration` ([after](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/04-functions/after.md)).
- **Set `export const maxDuration = 120`** on the export and retry routes ([maxDuration](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md)). Hobby allows up to 300 s ([function limits](https://vercel.com/docs/functions/limitations)).
- **The lease covers a worker that dies mid-render.** The next status read reports the job as failed, and a retry can run it again.
- **Why not Vercel Queues or Workflows (judgement).**
  - Queues is in beta ([Queues](https://vercel.com/docs/queues)).
  - Workflows brings the `workflow` 5.8.0 programming model with it ([Workflows](https://vercel.com/docs/workflows)).
  - Neither is needed for one job type, and in the demo NudgeBee is meant to be the orchestrator.

### Making it fail on purpose (labelled as synthetic)

- **Trigger.** A Flagsmith boolean, `export_failure_drill`, is read when the job is created. If Flagsmith is unreachable, the fallback is the env var `EXPORT_FAILURE_DRILL=once`.
- **Labelling.** The job record and the UI both show "Drill", because the brief requires synthetic traffic to be labelled.
- **Cost.** The drill fails before rendering, so it costs nothing.

### NudgeBee flow

This is the workflow from the plan:
1. Read the job status.
2. Branch when the status is `failed`.
3. Ask for approval in the app.
4. Call retry.
   - Use the NudgeBee run ID as the `Idempotency-Key` and as `X-Run-Id`, so replaying a run returns the same response and the run ID appears in `job_events`.
5. Read the status back and show the `artifactId`.

If the approval is rejected, the run ends.

**Security.**
- Compare tokens with `crypto.timingSafeEqual`.
- Ops routes return job metadata only, and the artifact URL is a short-lived signed URL.
- NudgeBee calls the production domain, which is public HTTPS.

**Evidence.** Hobby keeps runtime logs for only 1 hour ([limits](https://vercel.com/docs/limits)). Keep `job_events` and show it in a small Ops panel.

### Tests

1. With the drill on, `POST /api/exports` produces a failed job with `DRILL_INJECTED`.
2. A retry with key K returns 202, or 200 once the job has succeeded, and leaves exactly one artifact.
3. Repeating the retry with the same K returns the identical stored response.
4. A retry with a new key after success is a 200 no-op, and there is still one artifact.
5. Two concurrent retries with different keys on a failed job: exactly one queues the job.
6. Posting `POST /api/exports` twice for the same publication and format gives one job.

```bash
B="https://<project>.vercel.app"
curl -s "$B/api/ops/jobs/$JOB" -H "Authorization: Bearer $OPS_API_TOKEN"
curl -s -X POST "$B/api/ops/jobs/$JOB/retry?wait=25" \
  -H "Authorization: Bearer $OPS_API_TOKEN" -H "Idempotency-Key: $(uuidgen)"
```

---

## 10. Before 9 AM checklist for the user

| Allowed tonight | Waits until 09:00 |
|---|---|
| Accounts and logins, CLI installs, one **empty** Supabase project, keys saved in a password manager, checking phones | GitHub repo and first commit, create-next-app, any `npm install` in the project, shadcn, schema and migrations, buckets, seed users, Flagsmith flags and experiments, NudgeBee workflows, linking the Vercel project and adding env vars, any code or final design |

This follows the event rules and the plan's "Project code, migrations, final designs, custom flags and workflows start at 09:00".

The steps take about 25 minutes plus waiting.

1. **Vercel (5 min).**
   - Sign in at https://vercel.com/login with GitHub, on the personal Hobby account. A Hobby project can't connect to a repo owned by a GitHub organization ([limits](https://vercel.com/docs/limits)).
   - Install the CLI and log in:
     - `npm i -g vercel@66.6.0`
     - `vercel --version` (should print 66.6.0)
     - `vercel login`
     - `vercel whoami`
   - This laptop has an old Vercel CLI login, and `whoami` shows whether it still works ([CLI](https://vercel.com/docs/cli)).
   - Create nothing else.
2. **Supabase (10 min, plus provisioning).**
   - Go to https://supabase.com/dashboard and sign in with GitHub.
     - Free allows 2 active projects, so check that a slot is free ([pricing](https://supabase.com/pricing)).
   - Create a new organization on the Free plan, then a new project:
     - Choose a name.
     - Generate a strong database password and save it.
     - Set the region to Mumbai, ap-south-1 ([regions](https://supabase.com/docs/guides/platform/regions)).
   - When the project is ready, save these in the password manager (never in the repo or in chat):
     - The project URL, `https://<ref>.supabase.co`.
     - The publishable key (`sb_publishable_...`) and the secret key (`sb_secret_...`), from the project's API Keys settings ([API keys](https://supabase.com/docs/guides/api/api-keys)).
     - From the **Connect** dialog: the **Transaction pooler** URI (port 6543) and the **Session pooler** URI (port 5432), with the password filled in ([connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)).
   - In the Email provider settings under Authentication, turn off **Confirm email** ([passwords](https://supabase.com/docs/guides/auth/passwords)).
   - Optional: note the Realtime setting "Allow public access" ([Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)). It only matters for the optional doorbell.
   - Create no tables, buckets, policies or users.
   - Don't use the Vercel Marketplace route ([Marketplace](https://supabase.com/docs/guides/integrations/vercel-marketplace)).
3. **Tunnel tool (2 min).**
   - `brew install cloudflared`, then `cloudflared --version`. Homebrew has 2026.11.2.
   - Quick tunnels need no account.
4. **GitHub (1 min).**
   - `gh auth status`.
   - Pick the public repo name.
   - Create no repo and no commits with code until 09:00, so the history starts after the start time.
5. **Phones (3 min).**
   - iPhone: Settings › General › About › iOS Version. 18.4 or later records WebM/Opus; older versions record MP4/AAC. Both work with Sarvam.
   - Android: update Chrome.
   - Both: charge them, and know the hotspot password.
6. **Laptop (1 min).**
   - `node -v` should print v24.x, and `npm -v` should print 11.x.
   - Google Chrome must be installed; Lane D uses it for local card exports.
   - Docker is not needed.
7. **Keys.** Have the Sarvam, Flagsmith and NudgeBee credentials in the password manager, as the plan's tonight-list says. `.env.local` gets filled at 09:00.

---

## 11. 9:00 scaffold sequence

The lead's Claude session runs this from the repo root. Targets:
- by about 09:30, a production URL is live;
- by about 09:50, the contracts are on `main`;
- by 09:55, four lanes are running, before the 10:00 keynote.

**09:00 Scaffold in a sibling folder.**
- create-next-app refuses a folder containing `README.md` or `.env.local`. Its allow-list covers `.git`, `.gitignore`, `docs` and `.claude` ([create-next-app source](https://github.com/vercel/next.js/tree/v16.4.6/packages/create-next-app)).

```bash
cd ..
npx --yes create-next-app@16.4.6 jashn-scaffold \
  --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm \
  --no-cache-components --no-react-compiler --agents-md --no-agent-feedback \
  --disable-git --skip-install --yes
rsync -a --exclude .git --exclude .gitignore --exclude README.md jashn-scaffold/ Jashn/
rm -rf jashn-scaffold
cd Jashn
```

**09:04 Package metadata and ignore rules.**

```bash
npm pkg set name=jashn engines.node=24.x
npm pkg set "scripts.typecheck=tsc --noEmit" "scripts.db:generate=drizzle-kit generate" \
  "scripts.db:migrate=drizzle-kit migrate" "scripts.db:seed=tsx scripts/seed.ts" "scripts.test=vitest run"
printf '\n# added at scaffold\n*.pem\nCLAUDE.local.md\n.claude/settings.local.json\n.claude/*.lock\n' >> .gitignore
```

**09:06 Install** (the lead only; lanes never install).

```bash
npm install
npm install --save-exact @supabase/supabase-js@2.119.2 @supabase/ssr@0.12.7 drizzle-orm@0.45.4 \
  postgres@3.4.9 zod@4.6.7 sarvamai@1.1.22 flagsmith@10.0.0 flagsmith-nodejs@8.1.2 \
  puppeteer-core@25.11.0 @sparticuz/chromium@153.0.0 server-only@0.0.1
npm install --save-exact -D drizzle-kit@0.31.11 @next/env@16.4.6 tsx@4.23.15 vitest@5.1.1 @types/node@24.19.2
npm ls next react tailwindcss typescript drizzle-orm postgres
```

**09:12 shadcn with the Radix base.**
- `--base` takes `base`, `radix` or `aria`, and `-y` skips prompts ([shadcn CLI](https://ui.shadcn.com/docs/cli)).
- If `init` can't detect Tailwind (unverified with the Turbopack loader), rerun it without `--yes` and point it at `src/app/globals.css`.

```bash
npx --yes shadcn@4.23.0 init --base radix --yes --no-monorepo
npx --yes shadcn@4.23.0 add button card input label textarea select checkbox switch dialog sheet \
  tabs badge separator skeleton table sonner dropdown-menu avatar tooltip popover scroll-area --yes
```

**09:16 Config files** (Claude writes these; still no feature code).
- `AGENTS.md`: our rules from section 5, below the managed block.
- `CLAUDE.md`: `@AGENTS.md`.
- `.env.example`: the names from section 12, with no values.

`vercel.json` ([regions](https://vercel.com/docs/functions/configuring-functions/region), [git configuration](https://vercel.com/docs/project-configuration/git-configuration)):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["bom1"],
  "git": { "deploymentEnabled": { "lane-*": false } }
}
```

`next.config.ts`: keep the `turbopack.rules['*.css']` block that create-next-app wrote for Tailwind, and add:

```ts
allowedDevOrigins: ['*.trycloudflare.com'],
async headers() {
  return [{
    source: '/i/:path*',
    headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ],
  }]
},
```

**09:20 Check and commit.**

```bash
npm run typecheck && npm run lint && npm run build
git check-ignore -v .env.local          # must print the .env.* rule
git status --short                      # .env.local must not appear
git add -A
git commit -m "Scaffold Next.js 16.4.6 app with deploy config" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git branch -M main
```

**09:23 GitHub and Vercel.**
- If `git remote -v` already shows `origin`, skip `gh repo create` and just run `git push -u origin main`.
- `vercel project create` takes a required name ([vercel project](https://vercel.com/docs/cli/project)).
- `link --yes` doesn't choose a team, so add `--scope` if the account has several ([vercel link](https://vercel.com/docs/cli/link)).
- `git connect` attaches the GitHub remote so that pushes to `main` deploy production ([vercel git](https://vercel.com/docs/cli/git)). If it fails, import the repo once in the dashboard.

```bash
gh repo create <repo-name> --public --source=. --remote=origin --push
vercel project create jashn
vercel link --yes --project jashn
vercel git connect --yes
```

**09:26 Env vars to Vercel.**
- First append `OPS_API_TOKEN` and `RENDER_TOKEN_SECRET` to `.env.local`, each generated with `openssl rand -base64 32`.
- The loop never prints values or puts them in shell history.
- Production and Preview default to the Secret type, and `NEXT_PUBLIC_` names are stored as Config ([vercel env](https://vercel.com/docs/cli/env)).
- Values in `.env.local` must be unquoted for this loop to work.

```bash
for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY DATABASE_URL \
         SARVAM_API_KEY FLAGSMITH_SERVER_KEY NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID OPS_API_TOKEN RENDER_TOKEN_SECRET; do
  v="$(grep -E "^${k}=" .env.local | head -n1 | cut -d= -f2-)"
  [ -n "$v" ] && printf '%s' "$v" | vercel env add "$k" --environment production,preview --yes
done
vercel env ls
```

**09:28 First production deploy, through Git.** Deploying through Git means only committed files are uploaded.

```bash
git commit --allow-empty -m "Trigger first production deploy" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

Then open `https://<project>.vercel.app` on both phones, bookmark it, and allow the microphone once Lane C's dock exists.

**09:30–09:50 Contracts.** The lead's session writes `src/contracts/*` as described in section 5, then commits and pushes.

**09:50 Worktrees, one per lane.**
- Run `npm ci` in each worktree. Turbopack resolves only inside the root it detects from the lockfile, so a symlinked shared `node_modules` won't resolve ([turbopack](https://unpkg.com/next@16.4.6/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md)).
- Separate folders also avoid Next 16's one-`next dev`-per-folder lock ([version-16 guide](https://unpkg.com/next@16.4.6/dist/docs/01-app/02-guides/upgrading/version-16.md)).

```bash
git worktree add ../jashn-a -b lane-a-data
git worktree add ../jashn-b -b lane-b-planner
git worktree add ../jashn-c -b lane-c-voice
git worktree add ../jashn-d -b lane-d-invite
for l in a b c d; do cp .env.local ../jashn-$l/ && (cd ../jashn-$l && npm ci); done
# write CLAUDE.local.md in each worktree, then start one Claude Code session per worktree
# dev server per lane: npm run dev -- --port 3001 (A), 3002 (B), 3003 (C), 3004 (D)
```

**Every 45–60 minutes after that (lead):**

```bash
git merge --no-ff lane-a-data            # then lane-b-planner, lane-c-voice, lane-d-invite
npm ci && npm run typecheck && npm run build
git push                                 # Vercel builds main; Hobby runs one build at a time
# each lane then runs: git merge main
```

**Lane A's database loop:**
1. `npm run db:generate`
2. Read the generated SQL.
3. `npm run db:migrate`
4. Commit `drizzle/`.
5. `npm run db:seed`. The seed is idempotent: it uses fixed UUIDs and upserts, and treats "user already exists" as success.

---

## 12. Env vars

| Name | Local | Vercel (production + preview) | Browser-visible | Lane | Value |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | yes | A | Project URL ([SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs)) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes | yes | A | `sb_publishable_...` ([API keys](https://supabase.com/docs/guides/api/api-keys)) |
| `SUPABASE_SECRET_KEY` | yes | yes | no | A | `sb_secret_...`, for admin `createUser` and Storage |
| `DATABASE_URL` | yes | yes | no | A | Transaction pooler, port 6543 |
| `MIGRATION_DATABASE_URL` | yes | no | no | A | Session pooler, port 5432 |
| `SEED_PASSWORD` | yes | no | no | A | Password for the fictional demo users (our name) |
| `SARVAM_API_KEY` | yes | yes | no | C | Sarvam dashboard |
| `FLAGSMITH_SERVER_KEY` | yes | yes | no | C | Flagsmith server-side environment key (our name) |
| `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` | yes | yes | yes | C | Flagsmith client environment key (our name) |
| `OPS_API_TOKEN` | yes | yes | no | D | `openssl rand -base64 32`; also stored as a credential in NudgeBee |
| `RENDER_TOKEN_SECRET` | yes | yes | no | D | `openssl rand -base64 32` |
| `NUDGEBEE_WEBHOOK_URL` | optional | optional | no | D | Only if the failure webhook is used |
| `EXPORT_FAILURE_DRILL` | optional | optional | no | D | `once` runs the drill without Flagsmith |
| `APP_BASE_URL` | yes | no | no | D | `http://localhost:300N` or the tunnel URL. Production derives it from `VERCEL_PROJECT_PRODUCTION_URL`. |
| `CHROME_EXECUTABLE_PATH` | Lane D only | no | no | D | Local Chrome binary, normally `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |

### Set by Vercel

These are set automatically ([system env vars](https://vercel.com/docs/environment-variables/system-environment-variables)):

| Variable | Note |
|---|---|
| `VERCEL_ENV` | |
| `VERCEL_PROJECT_PRODUCTION_URL` | No protocol; use it for self-calls and Chromium |
| `VERCEL_URL` | Deployment URL behind protection; don't use it for self-calls |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Exists only after Protection Bypass for Automation is turned on ([bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)) |

Vercel documents HTTP/2 `fetch`, with an empty `statusText`, on Node 26, and `VERCEL_FETCH_DISABLE_H2=1` turns it off ([advanced Node config](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration)). We pin Node 24. Keep the switch in mind only if a sponsor API behaves oddly from Vercel.

### Fallback stack only

| Variable | Source |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Set by the Neon Marketplace integration ([Neon Vercel](https://neon.com/docs/guides/vercel-managed-integration)) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | [Better Auth installation](https://www.better-auth.com/docs/installation) |
| `BLOB_READ_WRITE_TOKEN` | [Vercel Blob](https://vercel.com/docs/vercel-blob) |

---

## 13. Risks

| # | Risk | Signal and deadline | Mitigation |
|---|---|---|---|
| 1 | Chromium export fails on Vercel: binary, memory, `ETXTBSY` or cold start | No production export of the Lotus Hall card by **12:15** | Set `card_renderer=og` for the Latin-only `next/og` fallback, and mark PDF and dynamic Hindi as Partial |
| 2 | Hindi renders wrongly on the card | Lane D's first test | Chromium shapes text; use only fonts that have a Devanagari subset (section 7) |
| 3 | Agents drift to the wrong versions: postgres 4, Drizzle v1 docs, Base UI, TypeScript 7, ESLint 10, Cache Components, Prisma's tag mismatch, Node 26 | Build or type errors after a merge | Exact pins plus the lockfile; AGENTS.md forbids installs and `@latest`; `engines.node` is set |
| 4 | Tables reachable through Supabase's Data API with the publishable key | Any table created in `public` | All tables live in the `app` schema ([custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas)) |
| 5 | Auth emails: confirmation on by default, and 2 emails an hour | Users can't sign in | Turn confirmation off tonight; create demo users with `admin.createUser` |
| 6 | Schema conflicts between lanes | Migration errors after a merge | One schema owner (Lane A); additive changes only after 11:00; no `push` |
| 7 | Merge conflicts in shared files | Conflicts in the lockfile, layout or `components/ui` | Those files belong to the lead; lanes never install |
| 8 | Vercel Hobby limits: one build at a time, 100 deployments a day, 1 h of logs | Builds queue | Merge in batches every 45–60 min; keep `job_events` as evidence ([limits](https://vercel.com/docs/limits)) |
| 9 | WebSockets on venue Wi-Fi | Realtime drops | Polling is the baseline; switch to the hotspot per the plan's risk 7 |
| 10 | The 4.5 MB body limit | Photo upload fails | Signed upload URLs; signed download URLs |
| 11 | iOS microphone and audio rules | No prompt, or a silent reply | Production HTTPS origin; unlock audio inside the gesture; "Play reply" button |
| 12 | The tunnel hostname changes and has no uptime guarantee | Phone loses the page | Use the production URL for all phone demos |
| 13 | Very new releases: @sparticuz/chromium 158.0.0 and Supabase CLI 3.4.0 were both published 2026-11-24 | n/a | Pinned to 153.0.0; the CLI isn't used |
| 14 | A GitHub organization owns the repo | Vercel refuses to connect it | Create the repo under the personal account |
| 15 | Secrets leak into the public repo | `git status` shows `.env.local` | `.gitignore` covers `.env.*`; check `git status` before every push; the env loop doesn't print values |
| 16 | Supabase Free pauses after a week idle | Someone opens the demo days later | Note it in the README ([pricing](https://supabase.com/pricing)) |
| 17 | Cold starts during recording | A slow first request or export | Warm up 5 minutes before recording: open every page and run one export |

---

## 14. Unknowns

- **Supabase project provisioning time.** I found no published figure, so create the project tonight.
- **The default of Supabase Realtime's "Allow public access".** Check it in the dashboard; it only matters for the optional doorbell.
- **The Supabase Vercel Marketplace route.** Unknown whether it offers the free plan or can attach an existing project. It isn't needed.
- **The Free plan's pooler connection limits.** Check the dashboard and keep the client pool small.
- **Chromium on Vercel in `bom1`:** cold-start time and per-export duration. Measure them on Lane D's first deploy.
- **Whether `outputFileTracingIncludes` is needed** for `@sparticuz/chromium`'s `bin/` files on Vercel. Only matters if `executablePath()` throws a missing-file error.
- **The exact launch options for @sparticuz/chromium 153.0.0.** I read the README for the newest release.
- **shadcn `init --yes` with Tailwind's Turbopack loader (no PostCSS config):** whether it works, and which preset `--base radix --yes` picks.
- **Whether `vercel git connect` succeeds** before the Vercel GitHub app is installed on the account.
- **Whether iOS Safari asks for the microphone on every visit** to the production domain.
- **Whether Sarvam accepts a content type with the `;codecs=opus` suffix.** Test it with the first real recording.
- **NudgeBee's HTTP task timeout, retry behaviour and source network.** Ask at 11:10. `?wait=` and 202 responses cover both short and long timeouts.
- **Whether satori 0.33 or later renders our Hindi lines correctly.** Takumi, another HTML-to-image renderer, was not evaluated.
- **Neon's cold-start time and its realtime options.** These only matter for the fallback.
- **Whether the venue network blocks WebSockets.** My attempt to fetch a source on this failed.
- **Whether Vercel Workflows is GA.** Not used.
