# Vibe

Vibe is a campus social app for students and clubs at the shared IU and Purdue campus in Indianapolis.
Students sign up with a school email, follow and join clubs, post to a campus feed, RSVP to events and message each other and their clubs.
The live site is https://www.connectvibe.app, run by CONNECTVIBE. LLC.

This README is the map. How the pieces work is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Stack

| Part | What is used | Where it is wired |
|---|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript | `src/app`, `src/components`, `src/lib` |
| Styling | Tailwind CSS 4 plus the app's own CSS variables | `src/app/globals.css` |
| Database, sign-in, file storage | Supabase (Postgres, Auth, Storage) | `src/lib/supabase/`, `supabase/` |
| Hosting, cron jobs | Vercel | `vercel.json`, `next.config.ts` |
| Video and chat media | Cloudflare R2 (S3 API) | `src/lib/r2.ts` |
| "Are you a person" box | Cloudflare Turnstile | `src/lib/auth/captcha.ts` |
| Email | Resend | `src/lib/resend.ts`, `src/lib/email/` |
| Error reports | Sentry | `src/instrumentation*.ts`, `src/sentry.*.config.ts`, `src/lib/sentry-config.ts` |
| Payments (Vibe+) | Stripe. Built, switched off in production | `src/lib/billing/` |
| Store apps | Capacitor shell that opens the live site | `mobile/` (see `mobile/README.md`) |

> This Next.js version differs from older ones. Read `AGENTS.md` first.
> One example: the request gate is `src/proxy.ts`, not `middleware.ts`.

## Quick start

You need: a recent Node (the tests rely on Node running `.ts` files directly, which is on by default from 22.18; the repo pins no version and was last checked on Node 25), npm, Docker, and the Supabase CLI.

```sh
npm ci
supabase start                 # local Postgres, Auth and Storage; applies supabase/migrations and supabase/seed.sql
node scripts/local-seed.mjs    # test accounts, clubs, posts and events (local stack only)
npm run dev                    # http://localhost:3000
```

Then set up the env files (next section) before the first `npm run dev`.

- `supabase start` runs every file in `supabase/migrations/` and then `supabase/seed.sql`, which keeps sign-up open locally.
- `scripts/local-seed.mjs` refuses to run unless the database is on `127.0.0.1` or `localhost`. It reads its keys from `supabase status -o env`, not from an env file.
- The seed creates five accounts on the made-up domain `example.test`, including one platform admin and one plain member. When it finishes it prints the account table and the shared local password.
- `node scripts/demo-seed.mjs` adds a second, invented cast used for screenshots and the demo film. It sits next to the test seed and does not replace it.

### Env files

Values never go in git. `.env.example` lists every variable with a long comment on each. Copy names from it; get values from the team.

| File | Use |
|---|---|
| `.env.example` | The reference. Committed. No values. |
| `.env.local` | Your base values. Ignored by git. |
| `.env.development.local` | Read first by `next dev`. Keep the local Supabase stack's URL and keys here, and any test-only keys. Ignored by git. |

The minimum to run against the local stack:

| Variable | What it is for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase API address (local: printed by `supabase status`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The public browser key. Never a secret key; the build refuses one |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key, used by route handlers |
| `SCHOOL_EMAIL_VERIFY_SECRET` | Signs school-email verification tokens (16 characters or more) |
| `NEXT_PUBLIC_SITE_URL` | The site's own address, used in email links |

Optional groups, all described in `.env.example`: `R2_*` (video and chat media), `RESEND_API_KEY` and `RESEND_FROM` (email), `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `STRIPE_*` and `BILLING_ENABLED`, `PUSH_*` / `VAPID_*` / `FCM_SERVICE_ACCOUNT_B64`, `CHAT_V2_*` and `CHAT_DESKTOP_*`, `RESTRICTION_PEPPER`, `CRON_SECRET`, `WAITLIST_*`.
Without a Resend key the dev server sends no email. Without a Turnstile key there is no box and local sign-in works as is.

### Checks

```sh
npm test            # node's built-in test runner over every src/**/*.test.ts
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # production build; also runs the secret-key guard in next.config.ts
```

Two things to know about the tests:

- `node --test` takes files, not a folder. To run one: `node --test src/lib/device-hint.test.ts`.
- Many tests read source files as text (for example to check that a static page still carries the same script as its React twin). A hand edit in one file can fail a test that lives elsewhere, so run the whole suite, not only the file's own test.

There is no CI in the repo. Run the three checks before you push.

## Where things live

| Path | What is in it |
|---|---|
| `src/app/` | Routes. Pages (`page.tsx`), API routes (`api/**/route.ts`), the root layout, `globals.css` |
| `src/proxy.ts` | Runs on every page and API request: session refresh, the suspended-account gate, the static-page guards, the Content-Security-Policy |
| `src/components/` | React components. `mobile/` is the phone UI, `desktop/` the desktop Messages, the rest are shared or per feature |
| `src/lib/` | Logic with no UI: auth, chat, moderation, billing, waitlist, security, Supabase clients. Most tests live here |
| `public/html/` | Three hand-written static pages (`profile.html`, `messages.html`, `onboarding.html`) and their scripts. Part of the desktop app, not leftovers |
| `public/sw.js`, `public/offline.html` | The service worker and its offline page |
| `supabase/migrations/` | Every database change, one SQL file each, in timestamp order |
| `supabase/config.toml`, `supabase/seed.sql`, `supabase/templates/` | Local stack settings, the local-only seed, the sign-up email template |
| `scripts/` | One-off and maintenance scripts. See `scripts/README.md` |
| `mobile/` | The App Store and Google Play shell (Capacitor). Own `package.json`; excluded from the root lint, typecheck and Vercel build |
| `handoffs/` | Session notes, plans and contracts. Code comments cite these files by path. The newest file is the current state |
| `.claude/workflows/`, `.claude/skills/audit-sentinels/` | The two audit workflows (security, features) and how to run them |
| `brand/` | The September 2026 brand kit. Its README says what is out of date |
| `LIVE_SITES/README.md` | Live addresses, dashboards and health-check routes |
| `QA_CHECKLIST.md` | An older manual test list. Parts describe pages that no longer exist; see the note at its top |

Folders that exist on a founder's Mac but are ignored by git (`DOCS/`, `ARCHIVE/`, `PITCH/`, `RESEARCH/`, `journal/`, `otto_mockups/`) are not part of the codebase.
On a Mac `docs/` is the same folder as the ignored `DOCS/`, so developer docs live at the repo root.

## Deploys

- A push to `main` deploys to production on Vercel. There is no staging branch.
- A push that only changes `handoffs/` is skipped (`ignoreCommand` in `vercel.json`).
- `vercel.json` also schedules two daily cron routes under `src/app/api/cron/`. Each refuses a call without `CRON_SECRET`.
- `NEXT_PUBLIC_*` values are built in. Changing one on Vercel does nothing until the next deploy.
- Vercel Preview builds use the production database. Several switches are Production-only for that reason (see `.env.example`).
- Database changes do not deploy with the code. See "Migrations" in [ARCHITECTURE.md](ARCHITECTURE.md).
- The store apps load the live site, so a deploy changes them too.

## Deeper docs

- [ARCHITECTURE.md](ARCHITECTURE.md): the request path, phone and desktop screens, data layer, sign-up, features, theming, and the rules that bite. Includes a "to change X, look in Y" table.
- [scripts/README.md](scripts/README.md): what each script does and whether it is safe on production.
- [mobile/README.md](mobile/README.md): the store apps.
- `.env.example`: every environment variable, with how to turn each feature on and off.
- `.claude/skills/audit-sentinels/SKILL.md`: when and how to run the audits.
- `handoffs/`: start with the newest dated file.
