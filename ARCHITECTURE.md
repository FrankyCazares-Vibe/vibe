# Vibe architecture

How the code works and where each part lives. Written for a developer who is new to the repo.
Every path below was checked against the code on October 13, 2026. File headers in this repo are long and current; when this page and a header disagree, trust the header.

Contents:

1. [Feature index: "to change X, look in Y"](#1-feature-index)
2. [The request path](#2-the-request-path)
3. [Phone and desktop screens](#3-phone-and-desktop-screens)
4. [The static pages and their twins](#4-the-static-pages-and-their-twins)
5. [Data layer](#5-data-layer)
6. [Sign-up and sign-in](#6-sign-up-and-sign-in)
7. [Features](#7-features)
8. [Theming](#8-theming)
9. [Observability](#9-observability)
10. [Rules that bite](#10-rules-that-bite)

## 1. Feature index

Routes are folders under `src/app/`. API routes are `src/app/api/**/route.ts`. "Phone" means a window under 900px wide.

| I want to change | Look in |
|---|---|
| What runs on every request (session, gates, security header) | `src/proxy.ts` |
| The Content-Security-Policy, or allow a new outside host | `src/lib/security/csp.ts` (+ `csp.test.ts`) |
| Other security headers, redirects, the build's secret-key guard | `next.config.ts`, `src/lib/supabase/key-guard.ts` |
| The landing page | `src/app/page.tsx`, `src/components/landing/` |
| Sign-in, sign-up, password pages | `src/app/auth/`, `src/components/auth/`, `src/lib/auth/` |
| The "are you a person" box | `src/lib/auth/captcha.ts`, `src/components/auth/TurnstileBox.tsx` |
| The waitlist and access codes | `src/app/waitlist/`, `src/app/api/waitlist/`, `src/lib/waitlist/`, `supabase/migrations/20261003*_waitlist*.sql` |
| School email check and the yearly check-in | `src/app/auth/school-email/`, `src/app/api/auth/school-email/`, `src/lib/auth/school-*.ts` |
| Who may open the signed-in pages (Terms, school, onboarding) | `src/lib/auth/campus-access.ts` |
| Onboarding | Phone: `src/components/mobile/OnboardingMobile.tsx`, `src/components/mobile/onboarding/`. Desktop: `public/html/onboarding.html` served by `src/app/onboarding/classic/route.ts`. Shared: `src/lib/onboarding/` |
| The campus feed | Phone: `src/components/mobile/CampusMobile.tsx`. Desktop: `src/app/campus/campus-home.tsx`. API: `src/app/api/feed/`, `src/app/api/posts/` |
| Writing a post | Phone: `src/components/mobile/PostComposerMobile.tsx`. Desktop: inside `campus-home.tsx`. API: `src/app/api/me/publish-post/`. Shared: `src/lib/composer/`, `src/lib/posts/` |
| Opening one post | `src/app/posts/[id]/`, `src/components/mobile/PostViewerMobile.tsx`, `public/html/_postViewer.js` (static profile) |
| Video and photo storage | `src/lib/r2.ts`, `src/lib/media/`, `src/lib/post-media-url.ts`, upload-url routes under `src/app/api/me/` |
| Clubs (orgs): page, join, follow, invites | `src/app/orgs/[handle]/`, `src/app/api/orgs/`, `src/lib/orgs/`, `src/lib/club-routes/`, `src/components/orgs/` |
| Events, RSVP, calendar files | `src/app/api/events/`, `src/app/api/me/calendar/`, `src/lib/events/`, `src/app/orgs/[handle]/OrgEventsSection.tsx` |
| Messages on a phone | `src/components/mobile/MessagesMobile.tsx`, `src/components/mobile/messages/` |
| Messages on desktop | `src/components/desktop/messages/` (new chat), `public/html/messages.html` (old, shown when the new chat is off) |
| Chat rules, rooms, cards, the on/off switches | `src/lib/chat/`, `src/lib/messages/`, `src/app/api/me/threads/`, `src/app/api/orgs/[slug]/channels/` |
| The small Messages window on desktop | `src/components/desktop/messages/MiniMessenger.tsx` and its twin `public/html/_miniMessenger.js` |
| Network (people, follows, suggestions) | `src/app/network/`, `src/components/network/`, `src/components/mobile/NetworkMobile.tsx`, `src/lib/connections/`, `src/app/api/me/follow*`, `src/app/api/users/` |
| Profile | Phone: `src/components/mobile/ProfileMobile.tsx`. Desktop: `public/html/profile.html`. Shared: `src/lib/profile/`, `src/app/api/me/profile*`, `src/app/api/users/[handle]/` |
| Resumes (private files, redaction) | `src/app/api/resume/[...path]/`, `src/lib/profile/resume-*.ts` |
| Otto (the assistant panel, reminders) | `src/app/otto/`, `src/components/otto/`, `src/components/network/OttoCorner.tsx`, `OttoSidePanel.tsx`, `src/components/mobile/OttoMobile.tsx`, `src/app/api/me/otto/`, `src/lib/otto/`, `public/html/_otto.js` |
| Settings (look, notifications, sessions, personal email) | `src/app/settings/`, `src/components/settings/` |
| Notifications and push | `src/app/api/me/notifications/`, `src/lib/push/`, `src/components/push/`, `src/app/api/me/push-devices/` |
| Reports, blocks, mutes | `src/components/safety/ReportSheet.tsx`, `src/lib/safety/`, `src/app/api/me/reports/`, `block/`, `mute/`, `public/html/_safetyActions.js` |
| Moderation and the admin page | `src/app/admin/`, `src/app/api/admin/`, `src/lib/moderation/`, `src/lib/auth/require-platform-admin.ts` |
| The suspended-account page | `src/app/account/suspended/`, plus the gate in `src/proxy.ts` |
| Vibe+ billing | `src/app/plus/`, `src/app/api/billing/`, `src/lib/billing/`, `src/lib/premium/require-plus.ts`, `scripts/stripe-setup.mjs` |
| Legal pages, cookie notice, Terms acceptance | `src/app/legal/`, `src/components/legal/`, `src/lib/legal/`, `src/app/auth/terms/` |
| The page-open tally (admin "Numbers") | `src/lib/tally/`, `src/components/tally/OpenBeacon.tsx`, `src/app/api/tally/open/`, `src/app/admin/numbers-client.tsx` |
| The usage summary (admin "Usage") | `src/lib/usage/`, `src/app/api/admin/usage/`, `src/app/admin/usage-client.tsx`, `supabase/migrations/20261014120000_admin_usage_summary.sql` |
| Colours, Light and Night | `src/app/globals.css`, `src/lib/theme/` |
| The moving coral glow | `src/components/bloom/VibeBloom.tsx` + the `vibe-bloom-*` block at the end of `globals.css` |
| The animated "vibe." wordmark | `src/components/brand/KineticWordmark.tsx` + the `vibe-kinetic` block in `globals.css` |
| Email text and sending | `src/lib/resend.ts`, `src/lib/email/`, `src/lib/waitlist/email-content.ts`, `supabase/templates/` |
| Rate limits | `src/lib/rate-limit.ts` (database-backed) |
| Schools, campuses, majors | `src/lib/iu/`, `src/app/api/campuses/`, `public/html/_iu-majors.js` |
| Installable app (service worker, offline page, icons) | `public/sw.js`, `public/offline.html`, `src/app/manifest.ts`, `src/lib/pwa/`, `src/components/pwa/`, `scripts/check-pwa.mjs` |
| Inside the store apps | `src/lib/native/`, `src/components/native/NativeBridge.tsx`, `mobile/` |
| Reloading open tabs onto a new build | `src/lib/build/`, `src/components/build/BuildRefresh.tsx`, `src/app/api/version/`, twin `public/html/_buildRefresh.js` |
| Sentry settings and what is scrubbed | `src/lib/sentry-config.ts`, `src/instrumentation-client.ts` |
| Health checks (admins only) | `src/app/api/health/` |
| Cron jobs | `vercel.json`, `src/app/api/cron/`, `src/lib/cron/auth.ts` |
| Share cards and link previews | `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx`, `src/lib/og/` |
| The database | `supabase/migrations/` (new file per change) |

## 2. The request path

Every page and API request passes through `src/proxy.ts` first. This is what other Next versions call middleware. It must stay in `src/`: the dev server only picks it up there.

The matcher at the bottom of the file skips `_next` assets, image and film files, and three root files (`/sw.js`, `/offline.html`, `/manifest.webmanifest`). Everything else runs the steps below, in this order.

1. **Build the Content-Security-Policy.** Only for pages (not `/api/*`, not asset files). `cspFlavor()` in `src/lib/security/csp.ts` picks one of two flavours:
   - `app`, for every React page. Scripts need this request's nonce. The proxy writes the nonce onto the request headers so Next can stamp its own scripts, and `src/app/layout.tsx` reads `x-nonce` for the theme boot script.
   - `static`, for `/html/*.html` and `/onboarding/classic`. Those pages still have inline handlers, so scripts get `'unsafe-inline'` and no nonce. Every other directive is as tight as `app`.
2. **Refresh the session.** `updateSession()` in `src/lib/supabase/middleware.ts` asks Supabase Auth for the user and rewrites the session cookie.
3. **Hold a restricted account.** If the user's `app_metadata.restriction` is in force, pages redirect to `/account/suspended` and writes to `/api/*` get a 403 with `code: "account_restricted"`. A short allow-list stays open (sign out, delete account, billing portal, block, mute, remove a push device, sign out other devices, the legal pages).
4. **Guard the static pages.** `/html/profile.html` and `/html/messages.html` are served only with `?app=1` to a signed-in user. The one public case is the profile viewer, `/html/profile.html?app=1&handle=<h>`. Old or retired `/html/*` addresses redirect to the clean route.
5. **Two shortcuts.** `/profile` sends a signed-out visitor to sign-in. `/feed` redirects to `/campus` unless `NEXT_PUBLIC_SHOW_GLOBAL_FEED` is `true`.
6. **Send the response** with the policy header attached.

The proxy is the fast path, not the only wall. It can miss a restriction if the auth lookup fails. The checks that cannot be skipped are in the route handlers and in the database (section 5).

After the proxy, a signed-in page calls `enforceCampusAccess()` (`src/lib/auth/campus-access.ts`). It redirects, in this order, when the visitor: is signed out; has no Terms acceptance on record; has no verified school email; has not finished onboarding. Each redirect carries `next=` so the visitor comes back to the page they asked for.

Headers that are not the CSP (HSTS, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` and so on) are set in `next.config.ts`. So are the apex-to-`www` redirect and the separate, hash-based policy for `/offline.html`, which skips the proxy.

## 3. Phone and desktop screens

Vibe has two UIs in one codebase. Which one shows is decided by the window's width: under 900px is the phone UI (`MOBILE_BREAKPOINT_PX` in `src/lib/use-is-mobile.ts`).

The server cannot see a window, so it guesses from the request headers (`src/lib/device-hint.ts`) and builds that screen first. Each route has a small `*Switch.tsx` file that loads only the guessed screen and swaps if the width disagrees after load.

| Route | Phone screen | Desktop screen |
|---|---|---|
| `/campus` (the feed, clubs, events, map) | `src/components/mobile/CampusMobile.tsx` | `src/app/campus/campus-home.tsx` |
| `/messages` | `src/components/mobile/MessagesMobile.tsx` | `src/components/desktop/messages/MessagesDesktop.tsx` when the `chat_desktop` switch is on for the person; otherwise an iframe of `public/html/messages.html` |
| `/messages?mini=1` | (desktop only) | `MiniFrame.tsx`: the phone's Messages, framed in a small window |
| `/network` | `src/components/mobile/NetworkMobile.tsx` | `src/components/network/NetworkPageClient.tsx` |
| `/otto` | `src/components/mobile/OttoMobile.tsx` | `src/components/otto/OttoPageClient.tsx` |
| `/profile`, `/profile/[handle]` | `src/components/mobile/ProfileMobile.tsx` | A hop to `public/html/profile.html?app=1` (`src/app/profile/profile-html-bridge.tsx`) |
| `/onboarding` | `src/components/mobile/OnboardingMobile.tsx` | An iframe of `/onboarding/classic`, which serves `public/html/onboarding.html` |
| `/orgs/[handle]` | One React page, `src/app/orgs/[handle]/OrgContent.tsx`, that adapts with `useIsMobile` | same |
| `/settings`, `/feed` | One React page inside `CampusAppShell` | same |

The frames around the screens:

- Phone: `src/components/mobile/MobileShell.tsx` and `MobileTabBar.tsx`.
- Desktop: `src/components/campus-app-shell.tsx`, which adds `src/components/LeftNav.tsx` and the Otto corner (`src/components/network/OttoCorner.tsx`).

Things to know before editing:

- `campus-home.tsx` is about 17,000 lines and `CampusMobile.tsx` about 4,500. They are separate implementations of the same page. A change to the feed, the composer, the club list or the map usually has to be made in both.
- `CampusMobile.tsx` still imports shared pieces from `campus-home.tsx`, so a phone downloads part of the desktop file. Moving those pieces out is planned work (see the newest handoff).
- A feature can be right on one screen and broken on the other. Check both, and check a width near 900px.

## 4. The static pages and their twins

`public/html/` holds three hand-written HTML pages with inline scripts and no build step:

| File | Role today |
|---|---|
| `profile.html` | The desktop profile, own and other people's. Still the only desktop profile. |
| `messages.html` | The old desktop Messages. Shown in an iframe when the new desktop chat is off for the person. |
| `onboarding.html` | The desktop onboarding. Served through `src/app/onboarding/classic/route.ts`, which injects the signed-in person's starting data. |

They exist because the app began as static prototypes and these three were never rebuilt in React. They are live product, guarded by `src/proxy.ts`, and they call the same `/api/*` routes as the React screens.

The `_*.js` files next to them are their shared scripts (`_persistence.js`, `_postViewer.js`, `_otto.js`, `_safetyActions.js` and others).

Because the static pages cannot import TypeScript, several pieces of logic exist twice. These are called twins in the code. Change one, change the other.

| React or TypeScript side | Static twin |
|---|---|
| `THEME_BOOT_SCRIPT` in `src/lib/theme/theme.ts` | Pasted into the head of the three pages and `public/offline.html` (`theme.test.ts` fails on drift) |
| `src/lib/build/build-refresh.ts`, `src/components/build/BuildRefresh.tsx` | `public/html/_buildRefresh.js` (`static-build-refresh.test.ts`) |
| `src/components/desktop/messages/MiniMessenger.tsx` | `public/html/_miniMessenger.js` |
| `src/components/pwa/ServiceWorkerRegistrar.tsx` | `public/html/_sw.js` |
| `src/lib/feedback/` (toasts, failure wording), `src/components/feedback/LoadFailed.tsx` | `public/html/_persistence.js` |
| `src/components/ImageCropperModal.tsx` | `public/html/_imageCropper.js` |
| `src/lib/media/shrink-photo.ts` | `public/html/_shrinkPhoto.js` (`shrink-photo-static.test.ts`) |
| `src/components/safety/ReportSheet.tsx`, report reasons in `src/lib/moderation/reports.ts` | `public/html/_safetyActions.js` |
| `src/components/mobile/PostViewerMobile.tsx` | `public/html/_postViewer.js` |
| `src/lib/profile/cover-themes.ts` | `public/html/_persistence.js` |

Not every twin has a drift test. Search the code for the word "twin" before changing shared behaviour.

Other limits of the static pages:

- They get the looser `static` CSP flavour (inline scripts allowed).
- New colours must use the tokens in `globals.css`; the pages carry their own copies of some styles.
- Never put a README or notes file under `public/`. Everything there is served to the world.

## 5. Data layer

### Supabase clients

All in `src/lib/supabase/`. Pick by where the code runs and whose rights it needs.

| Function | File | Runs as | Use for |
|---|---|---|---|
| `getSupabaseBrowserClient()` | `browser.ts` | The signed-in person, in the browser | Sign-in calls and reads the person is allowed to make |
| `createSupabaseServerClient()` | `server.ts` | The signed-in person, on the server (cookie session) | Finding out who is asking; reads and writes that row-level security should judge |
| `createSupabaseServiceClient()` | `service.ts` | The service role. Skips row-level security | Private columns, admin work, writes the route has already checked. Server only |
| `updateSession()` | `middleware.ts` | The proxy | Session refresh only |
| `createSupabaseClient()` | `src/lib/supabase.ts` | Anonymous, no cookies | Health checks |

All three session clients share `cookie-options.ts`, so the cookie flags never differ between them.

### Where the security boundary is

- **The database is the boundary, not the routes.** A signed-in person can call Supabase's REST API directly with the public key. So what they may read or write is decided by row-level security policies and column grants in `supabase/migrations/`.
- **Private columns** on `users` (Terms consent, onboarding answers, school email and others) are not granted to the browser roles. Server code reads them with the service client, filtered to the caller's id. `enforceCampusAccess()` is an example.
- **The service client skips row-level security.** In a route that uses it, the route's own checks are the enforcement. The helpers are `requireNotRestricted()` and `requireCanPublish()` in `src/lib/moderation/access.ts`, `requirePlus()` in `src/lib/premium/require-plus.ts`, the Terms check in `src/lib/legal/require-terms.ts`, and `requirePlatformAdmin()` in `src/lib/auth/require-platform-admin.ts`.
- **Text typed by a person never goes raw into a filter string.** Use `ilikeOrFilter()` and `isUuid()` from `src/lib/pgrest.ts`.
- **Rate limits live in Postgres** (`src/lib/rate-limit.ts`), because Vercel functions share no memory. The limiter fails open unless the caller passes `failClosed`.

### Files and media

| What | Where it is stored | How it is served |
|---|---|---|
| Avatars, banners, post photos | Supabase Storage bucket `profiles` (public read) | Direct URL. Uploads go through server routes (`/api/me/profile-upload`, `/api/me/profile-sync`), never from the browser to Storage |
| Resumes and portfolios | Supabase Storage bucket `resumes` (private) | `/api/resume/[...path]`, which signs a short-lived URL and can redact |
| Post videos, chat photos, group photos, club images | Cloudflare R2 (`src/lib/r2.ts`; key prefixes `clips/`, `messages/`, `groups/`, `orgs/`) | The browser uploads with a presigned URL from an `*-upload-url` route; reads go through a route that redirects to a signed URL |

The database stores storage keys, not public URLs. "Clips" in code names means video posts; the name is legacy.

### Migrations

- One SQL file per change in `supabase/migrations/`, named `<UTC timestamp>_<name>.sql`. There are over 100. Never edit an applied file; add a new one.
- Each file opens with a plain-English header: why, what it does, a pre-flight check and a post-check. Follow that shape.
- **Local:** `supabase start` (first run) or `supabase db reset` applies every file, then `supabase/seed.sql`. Run `node scripts/local-seed.mjs` afterwards.
- **Production:** a deploy does not touch the database. A maintainer applies each new file to the production project by hand and records it under the file's own version. The exact steps in use are in the newest handoff, under "Things a new session must know".
- Ship order matters. If code needs a new column, apply the migration before the deploy that reads it. `src/lib/db/missing-column.ts` exists for code that must survive the gap.
- Check scripts for some migrations are in `scripts/sql/`. Most are local-only and say so on their first lines.

## 6. Sign-up and sign-in

Sign-in is Supabase Auth with email and password. The browser talks to Supabase Auth directly with the public key (`src/app/auth/login/page.tsx`, `src/app/auth/signup/signup-form.tsx`). That one fact shapes the rest of this section: **no Vibe route sees an account being created**, so anything that must stop a sign-up has to live in Supabase.

### The waitlist switch and access codes

- One row, `signup_open` in the table `public.app_settings`, opens or closes sign-up. Changing it needs no deploy.
- The gate is a Supabase Auth "before user created" hook, the Postgres function `hook_waitlist_gate` (`supabase/migrations/20261003110000_waitlist_gate.sql`; wired for the local stack in `supabase/config.toml`). It allows a sign-up when the switch is open, when the address is on the allowlist, or when the sign-up carries a valid, unclaimed access code.
- `src/lib/waitlist/signup-open.ts` reads the same switch, but only to decide what the buttons say. It never lets anyone in.
- Access codes look like `VIBE-XXXX-XXXX`. Only a hash is stored. The format rules are in `src/lib/waitlist/access-code.ts` and are repeated in SQL; the file header says which tests keep the two in step.
- The public form is `src/app/waitlist/` and `src/app/api/waitlist/`. Founders send codes from the admin page (`src/app/api/admin/waitlist/`).
- Waitlist entries are deleted on a schedule by `src/app/api/cron/waitlist-purge/`.
- Locally, `supabase/seed.sql` leaves sign-up open. To see the closed state in dev, open `/auth/signup?signup=closed`.

### The human check (Cloudflare Turnstile)

- Rules and the on/off procedure: `src/lib/auth/captcha.ts`. The box itself: `src/components/auth/TurnstileBox.tsx`.
- It is on only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. Unset means no box, no Cloudflare script and no Cloudflare host in the CSP. Local dev runs that way.
- When Supabase's own captcha setting is on, Supabase refuses sign-up, password sign-in and "send a new email" without a token. **Any new browser call to Supabase Auth of those kinds must pass `options.captchaToken`.** The three existing call sites are the sign-up form, the sign-in page and `src/components/auth/ResendConfirmation.tsx`.
- There are two switches (the site key, and Supabase's setting) and the order matters in both directions. Read the header of `captcha.ts` before touching either.
- A Vercel Preview build has no key but talks to the same Supabase project, so sign-in does not work there while the check is on.

### School email

- A person signs up with their school email. Confirming that address is the school check (`src/lib/auth/school-sign-in.ts`).
- Accounts that sign in with a personal address verify a school address separately: `src/app/auth/school-email/`, `src/app/api/auth/school-email/` (`request`, `confirm`, `confirm-code`), signed with `SCHOOL_EMAIL_VERIFY_SECRET`.
- Which domains count, and which school system and campus they map to: `src/lib/auth/school-email-domains.ts`, `src/lib/iu/campuses.ts`. `SCHOOL_EMAIL_DOMAINS` can narrow the list but never add to it.
- The yearly check-in for school-email-only accounts: rules in `src/lib/auth/school-checkin.ts`, the daily job in `src/app/api/cron/school-checkin/`.
- Forgot password works on the sign-in address: `src/app/auth/forgot-password/`, `src/app/api/auth/password-reset/`.

### After sign-in

`src/lib/auth/post-login.ts` decides where a person lands. The gates that follow (Terms, school email, onboarding) are in `src/lib/auth/campus-access.ts`, described in section 2. Terms acceptance is recorded against `TERMS_VERSION` in `src/lib/legal/terms.ts`; raising that constant sends everyone through `/auth/terms` once.

## 7. Features

Short notes on how each area works. For file locations use the index in section 1.

**Feed and posts.** The feed is the main tab of `/campus`. `/feed` is a separate "global feed" page that is off unless `NEXT_PUBLIC_SHOW_GLOBAL_FEED` is `true` (`src/lib/feature-flags.ts`). Posts are published through `POST /api/me/publish-post`; likes, saves, reposts, comments and view counts are under `/api/posts/[id]/`. Tag and trending logic is in `src/lib/posts/` and `src/lib/trending/`.

**Clubs (orgs).** The code says "org"; the product says "club". Following a club and being a member are different things (`src/lib/orgs/following.ts`, `membership.ts`). Clubs can be hidden; the access rules for hidden clubs are in `src/lib/orgs/hidden-gate.ts` and in a migration. Officer-only actions go through `src/lib/club-routes/officer-guard.ts`.

**Events.** Created by clubs, with RSVP, attendee lists and `.ics` calendar files (`/api/events/[id]/`). A person's own calendar is `/api/me/calendar` and `/api/me/personal-events`.

**Messages and club chat ("chat v2").** One Messages area holds direct messages, group chats and club rooms. The data and rules are in `src/lib/chat/` (rooms, pins, cards such as polls and sign-ups, read state). The UI polls for new messages (`use-room-poll.ts`). Two per-person switches control the screens, both server-only env values read by `src/lib/chat/flag.ts`:

- `chat_v2` (`CHAT_V2_ENABLED`, `CHAT_V2_ALLOWLIST`, `CHAT_V2_CLUBS`): the new inbox and club rooms.
- `chat_desktop` (`CHAT_DESKTOP_ENABLED`, `CHAT_DESKTOP_ALLOWLIST`): the React desktop Messages. It needs `chat_v2` too.

A screen learns `chat_v2` from `GET /api/me/features`; the desktop pages get `chat_desktop` as a server prop. The old screens remain as the fallback when a switch is off. The database side of chat is not behind the switches.

**Network.** People search, follows, mutuals and suggestions.

**Profile.** Handles, layout, cover themes, work experience, resumes. Columns a person may write to their own row are listed in `src/lib/profile/self-write-columns.ts`.

**Otto.** The in-app guide: the onboarding questions, a panel with upcoming events, requests and activity, typed reminders (`src/lib/otto/parse-reminder.ts`), and on desktop a corner button that opens a side panel. No outside AI service is called.

**Moderation.** Reports, a text filter, image quarantine, and account restrictions (suspend or ban). A restriction is mirrored into the user's auth `app_metadata` so the proxy sees it on the next request. Bans are keyed on a keyed hash of the email, using `RESTRICTION_PEPPER`; read its comment in `.env.example` before setting it, because it can never be rotated. The admin page (`/admin`) has tabs for Reports, Clubs, Users, Waitlist, Numbers, Usage and Log, and is open to platform admins only.

**Billing (Vibe+).** Stripe Checkout, the customer portal and a webhook (`/api/billing/`). Prices are found by lookup key, never by an id in code or env. Entitlements are stored in the database and read through `requirePlus()`, which fails closed. Checkout is off unless `BILLING_ENABLED` is exactly `true` and both Stripe values are set; it is off in production.

**Legal pages and the policy check.** The pages are React files under `src/app/legal/`. The Privacy Policy is split across `src/app/legal/privacy/sections-*.tsx`, with its date in `page.tsx`. The source text is `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`. A script, `handoffs/legal-2026-10-04-privacy-v3/check/check.mjs`, compares the rendered page with that text word for word. Run it against a dev server with `--url http://localhost:3000/legal/privacy`. The one-time cookie notice on signed-out pages is `src/components/legal/CookieNotice.tsx`.

**The page-open tally.** Vibe's own visit counter, with no outside analytics tool. `OpenBeacon` posts once per page load from three pages (`/`, `/waitlist`, `/auth/signup`) to `/api/tally/open`. The table `page_open_tally` holds a day, a page name, a link label and a number, and nothing about the visitor. Its rate limit is keyed on a daily scrambled code, not on an IP address (`src/lib/tally/network-code.ts`).

**Installable app and push.** `public/sw.js` is the service worker; it registers on the production host only, or locally with `NEXT_PUBLIC_SW_DEV=1`. `scripts/pwa/sw-killswitch.js` is the emergency replacement. Push covers browsers (Web Push) and the store apps (FCM) through one pipeline in `src/lib/push/`, off unless `PUSH_ENABLED` is `true`.

**Store apps.** `mobile/` is a Capacitor shell that opens the live site. The web code detects it by user agent (`src/lib/native/detect.ts`).

**Open tabs follow the newest build.** `BuildRefresh` asks `/api/version` when a person returns to a tab and reloads if a newer build is live, never in the middle of an action. An editor that must not be interrupted marks itself with `data-holds-reload`.

## 8. Theming

- **One attribute carries the theme:** `<html data-theme="light">` or `"dark"`. The product names are Light and Night. A person's choice is Light, Night or Auto, kept in `localStorage` under `vibe_theme` and mirrored to their account by the Settings page. Auto is the default. The mechanism is `src/lib/theme/theme.ts`.
- **No flash on load.** `src/app/layout.tsx` ships `data-theme="light"` and an inline boot script (`THEME_BOOT_SCRIPT`) corrects it before first paint. `src/lib/theme/ThemeSync.tsx` keeps it right afterwards. The static pages paste the same script.
- **Tokens.** Colours are CSS variables in `src/app/globals.css`: the Light values in the `:root` block, the Night values in `:root[data-theme="dark"]`. Examples: `--cream` (page), `--paper` (cards), `--coral` (accent), `--on-coral` (text on coral), the `--ink-*` text colours. Tailwind's `dark:` variant is tied to the same attribute at the top of the file.
- **New UI must use the tokens.** A hard-coded hex colour will be wrong in one of the two looks.
- **The living bloom.** The page backdrop is a coral glow (`--feed-backdrop`, `--network-backdrop`). `src/components/bloom/VibeBloom.tsx` makes it drift slowly. Give the page container the `VIBE_BLOOM_HOST` class instead of a background and render `<VibeBloom />` as its first child. With reduced motion it is a still gradient. A wrapper with its own opaque background around the page will hide it; the component's header explains why.
- **The kinetic wordmark.** `src/components/brand/KineticWordmark.tsx`: the letters of "vibe." land one by one and the dot drops in, once per page load. Used on sign-in, sign-up and the landing bar.
- **The landing is always Night**, whatever the app theme (`data-theme-lock`, see `theme.ts`). It has its own stylesheet, `src/components/landing/landing.css`.
- Fonts: Fraunces and DM Sans from Google Fonts, and JetBrains Mono through `next/font`, all set in `src/app/layout.tsx`.

## 9. Observability

| What | Where |
|---|---|
| Errors and performance traces | Sentry. Browser: `src/instrumentation-client.ts`. Server and edge: `src/instrumentation.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`. Shared options and the scrubbing of links, labels and ids: `src/lib/sentry-config.ts` |
| CSP refusals | Reported to Sentry from `src/instrumentation-client.ts`, as the directive and the refused origin only |
| A crash in the root layout | `src/app/global-error.tsx` |
| Service health | `GET /api/health/{supabase,auth,r2,resend,sentry,push}`, platform admins only |
| Visits | The page-open tally, shown in the admin page's Numbers tab |
| Which emails were attempted | The email send log (`src/lib/email/send-log.ts`); `scripts/email-send-lookup.mjs` builds a lookup without putting an address into SQL |
| Which build is live | `GET /api/version` |
| Function logs and cron runs | Vercel |

What Sentry may receive is a privacy promise, not only a setting. `sentry-config.test.ts` fails if the scrubbing is removed. If you add data to an error report, the Privacy Policy may need to change too.

### Audits

Two repeatable audit workflows are committed: `.claude/workflows/security-sentinel.js` ("can this be attacked?") and `.claude/workflows/feature-sentinel.js` ("does this still work?"). When and how to run them is in `.claude/skills/audit-sentinels/SKILL.md`. Their reports are not kept in this document.

## 10. Rules that bite

Each of these has broken something, or would, without warning.

**Tests**

- Tests run on Node's own runner with type stripping, no bundler. A module that a test imports must be "pure": no `server-only`, no `@/` imports, no enums or other non-erasable TypeScript. Many files say this in their header. Keep them that way.
- Tests read other source files as text. After any hand edit run `npm test`, not just one file.
- `node --test` takes files, not a folder.

**Security**

- **A new outside host must be added to the CSP** in `src/lib/security/csp.ts` (and its test), or the browser will refuse it: scripts, images, fetches, frames, fonts. Hosts are origins only.
- **No secrets in the browser bundle.** Anything named `NEXT_PUBLIC_*` is public. `next.config.ts` checks at build time that the public Supabase key is not a secret key (`src/lib/supabase/key-guard.ts`), and `getSupabaseAnonKey()` checks again at run time. Put `import "server-only"` at the top of server modules that hold keys.
- **Never store a visitor's IP in a counter or limiter** that fires on merely opening a page. Follow `src/lib/tally/network-code.ts`.
- **Never use the service client in a route without a check first.** It skips row-level security.
- **`X-Frame-Options` is `SAMEORIGIN` on purpose.** The app frames its own pages in several places. `DENY` breaks them.
- **`public/offline.html` has a hash-based policy.** If you add or change an inline script there, update `OFFLINE_INLINE_SCRIPTS` in `next.config.ts` and its test in the same commit.
- **The proxy matcher is one regular expression.** A stray `|` makes it match nothing and the proxy silently stops running. `node scripts/check-pwa.mjs` tests it.

**Privacy and legal**

- **The Privacy Policy changes in the same deploy as the code.** If a change alters what the app collects, stores, shows or sends to another company, update the policy text, the page sections, the date, and run the page-equals-text check (section 7).
- Raising `TERMS_VERSION` re-prompts every account. Do it only with new Terms.

**Next.js and the build**

- Read `AGENTS.md` and the guides in `node_modules/next/dist/docs/` before using a Next API from memory. `AGENTS.md` is rewritten by `next dev`; do not edit it by hand.
- The request gate is `src/proxy.ts`. A root-level `middleware.ts` would run in production and be ignored in dev.
- Every page renders per request, because the root layout reads the nonce header. Do not add build-time prerendering to a page; its scripts would ship without a nonce and be refused.
- Turbopack's build cache is turned off in `next.config.ts` because it once shipped stale CSS. Leave it off.
- `NEXT_PUBLIC_*` values are fixed at build time.

**Two UIs, twin files**

- Check phone and desktop for every UI change (section 3).
- Keep twins in step (section 4).
- Bump `SW_VERSION` in `public/sw.js` on every edit to that file or to `public/offline.html`.

**Environments**

- Vercel Preview builds use the production database. Billing, push and chat switches are Production-only for that reason.
- The seed scripts refuse any database that is not local. Keep that guard in any new script that writes.
- Switches that take a list (`CHAT_V2_ALLOWLIST`, `PUSH_ALLOWLIST`) treat blank as nobody and `*` as everybody.

**Repo layout**

- `docs/` is ignored by git on a Mac (it is the same folder as the private `DOCS/`). Put developer docs at the root or next to the code.
- Nothing private goes under `public/`.
- `handoffs/` is committed and a push that touches only it does not deploy.
- `mobile/` is its own project. A bare `mobile/` ignore pattern would also match `src/components/mobile/`; the existing patterns are anchored for that reason.
