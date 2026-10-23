# Vibe architecture

How the code works and where each part lives. Written for a developer who is new to the repo.
Every path below was checked against the code on October 19, 2026; the clubs, events and sign-up parts again on October 23, 2026 (main `50a49ea`). File headers in this repo are long and current; when this page and a header disagree, trust the header.

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
| The first confirmation wiping an early password, "Choose your password" | `supabase/migrations/20261022110000_first_confirm_drops_password.sql` (with `20261022100000_password_needed_column.sql`, `20261022120000_no_self_service_email_change.sql`), `src/lib/auth/password-needed.ts`, `src/app/auth/choose-password/`, `src/app/api/me/accept-terms/`, the link-free notices in `supabase/templates/` |
| The waitlist and access codes | `src/app/waitlist/`, `src/app/api/waitlist/`, `src/lib/waitlist/`, `supabase/migrations/20261003*_waitlist*.sql` |
| School email check and the yearly school check-in | `src/app/auth/school-email/`, `src/app/api/auth/school-email/`, `src/lib/auth/school-*.ts` |
| Who may open the signed-in pages (Terms, school, onboarding) | `src/lib/auth/campus-access.ts` |
| Onboarding | Phone: `src/components/mobile/OnboardingMobile.tsx`, `src/components/mobile/onboarding/`. Desktop: `public/html/onboarding.html` served by `src/app/onboarding/classic/route.ts`. Shared: `src/lib/onboarding/` |
| The campus feed | Phone: `src/components/mobile/CampusMobile.tsx`. Desktop: `src/app/campus/campus-home.tsx`. API: `src/app/api/feed/`, `src/app/api/posts/` |
| Writing a post | Phone: `src/components/mobile/PostComposerMobile.tsx`. Desktop: inside `campus-home.tsx`. API: `src/app/api/me/publish-post/`. Shared: `src/lib/composer/`, `src/lib/posts/` |
| Opening one post | `src/app/posts/[id]/`, `src/components/mobile/PostViewerMobile.tsx`, `public/html/_postViewer.js` (static profile) |
| Likes, saves and reposts staying in step between the feed and the open post | `src/lib/posts/engagement-store.ts` |
| The "Reposted by" list | `src/app/api/posts/[id]/reposters/`, `src/lib/posts/reposters.ts` |
| The hashtag rule (how many, which characters) | `src/lib/posts/edit.ts` (`extractPostTags`, `isNewPostTag`), its copies in `public/html/profile.html` and `public/html/_postViewer.js`; trending in `src/lib/trending/count-tags.ts` |
| Video and photo storage | `src/lib/r2.ts`, `src/lib/media/`, `src/lib/post-media-url.ts`, upload-url routes under `src/app/api/me/` |
| Clubs (orgs): page, join, follow, invites | `src/app/orgs/[handle]/` (the page's parts in `club-page/`), `src/app/api/orgs/`, `src/lib/orgs/`, `src/lib/club-routes/`, `src/components/orgs/` |
| Who may join, and the Membership box's words (the 14-day wait) | `src/lib/orgs/join-state.ts` (`orgJoinState`), `src/lib/orgs/join-copy.ts`, `src/app/orgs/[handle]/club-page/MembershipBox.tsx`, `src/app/api/orgs/[slug]/join/` |
| Club roles (Owner and Officers) | `src/lib/orgs/join-state.ts`, `src/components/orgs/tools/member-rules.ts`, `src/app/api/orgs/[slug]/members/`, `supabase/migrations/20261021100000_club_officers.sql` |
| Club links (setup link, members' link) | `src/lib/club-links/`, `src/app/c/` (`/c/<code>`, `/c/welcome`), `src/app/api/club-links/redeem/`, `src/app/api/orgs/[slug]/members-link/`, `src/components/orgs/MembersLinkPanel.tsx`, Admin › Clubs (`src/app/admin/club-links-card.tsx`, `src/app/api/admin/club-links/`), `supabase/migrations/20261021110000_club_links.sql` and `20261021120000_club_links_gate.sql` |
| A new club's setup list | `src/app/orgs/[handle]/setup/`, `src/lib/club-links/setup.ts`, `setup-steps.ts`, `src/app/api/orgs/[slug]/setup/` |
| Club pages inside the app frame on a computer | `src/app/orgs/[handle]/club-frame.tsx`, `ClubShell.tsx`, `club-page/ClubCampusBar.tsx` |
| Club tools (officers) | Computer: the Arc and its panel, `src/app/orgs/[handle]/club-page/ClubToolsLauncher*.tsx`, `ClubToolsPanel*.tsx`, `club-tools-arc.ts`, `club-tools-panel.ts`. Phone: the tray, `club-page/ClubToolsTray*.tsx`, and the pages under `src/app/orgs/[handle]/tools/`. The screens both share: `src/components/orgs/tools/` |
| The phone's Profile tab standing for a club you run | `src/lib/orgs/club-switch.ts`, `src/components/orgs/ClubSwitcherSheet.tsx`, `src/components/mobile/MobileTabBar.tsx`, `src/app/api/me/clubs-you-run/` |
| "Your clubs" in the desktop left menu's profile card | `src/components/orgs/YourClubsMenu.tsx`, `src/lib/orgs/clubs-in.ts`, `src/app/api/me/clubs-in/`, `src/app/api/me/clubs-you-run/` |
| Club backgrounds and the Edit page's Look | `src/lib/orgs/backdrops.ts`, `src/app/orgs/[handle]/club-page/LookSection.tsx`, `look-section.ts` |
| A club's link picture, the share sheet, the table card | `src/app/orgs/[handle]/opengraph-image.tsx` and `twitter-image.tsx`, `src/lib/og/club-card.tsx`, `club-card-content.ts`, `club-page/ShareSheet.tsx`, `src/app/orgs/[handle]/table-card/` |
| Officers' Up next card (the steps of an event night) | `src/app/orgs/[handle]/club-page/UpNext.tsx`, `UpNextSteps.tsx`, `up-next-steps.ts` |
| Leaving a club (the Members only RSVPs warning) | `src/lib/orgs/leave-rsvps.ts`, `src/components/orgs/LeaveWarning.tsx`, `GET /api/orgs/<h>/join?leave_preview=1` |
| Events, RSVP, calendar files | `src/app/api/events/`, `src/app/api/me/calendar/`, `src/lib/events/`, `src/app/orgs/[handle]/OrgEventsSection.tsx` |
| Members only events, event icons | `src/lib/events/validate.ts` (`eventVisibilityOf`), `src/lib/events/event-icons.ts`, `supabase/migrations/20261025100000_event_visibility.sql`, `20261027100000_event_icons.sql` |
| Event check-in (door code, QR, "Mark as here") | `src/lib/events/event-checkin.ts`, `src/lib/events/checkin-route.ts`, `src/app/api/events/[id]/checkin/` (with `door/` and `marks/`), `src/app/api/me/event-checkins/`, `src/app/campus/checkin/[id]/` (with `door/`), `src/components/events/checkin/`, `src/components/settings/CheckinsCard.tsx`, `supabase/migrations/20261019120000_event_checkins.sql` |
| "What's the vibe tonight?", the Feed's "Your clubs" panel and the school calendars | `src/lib/school-events/`, `src/app/api/school-events/`, `src/components/campus/tonight/` |
| My Calendar: colours, event links, the month grid, other tabs hearing an RSVP | `src/lib/calendar/` (`calendar-key.ts`, `month-layout.ts`, `calendar-sync.ts`) |
| Messages on a phone | `src/components/mobile/MessagesMobile.tsx`, `src/components/mobile/messages/` |
| Messages on desktop | `src/components/desktop/messages/` (new chat), `public/html/messages.html` (old, shown when the new chat is off) |
| Chat rules, rooms, cards, the on/off switches | `src/lib/chat/`, `src/lib/messages/`, `src/app/api/me/threads/`, `src/app/api/orgs/[slug]/channels/` |
| Deleting your own message (the "Message deleted" note) | `src/lib/chat/delete-own.ts`, `src/lib/chat/deleted-note.ts`, `src/app/api/me/threads/[id]/messages/[messageId]/`, `supabase/migrations/20261019150000_message_deleted_note.sql` |
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
| The use totals (the usage heartbeat, and "Counted from launch on" in Usage) | `src/lib/usage/touch.ts`, `touch-client.ts`, `src/components/usage/ActivityTouch.tsx`, `src/app/api/me/heartbeat/`, `public/html/_usageTouch.js`, `supabase/migrations/20261014150000_usage_day_tally.sql` |
| Colours, Light and Night | `src/app/globals.css`, `src/lib/theme/` |
| Fonts and the logo's own font file | `src/lib/theme/fonts.ts` (+ `fonts.test.ts`), `public/fonts/vibe-wordmark-v1.woff2`, the landing's `src/components/landing/soft-font.ts` |
| Motion (springs, press feedback, reduced motion) | `src/lib/motion/`, the `.vibe-press` / `.vibe-toggle` block in `globals.css` |
| Each phone tab keeping its own scroll place | `src/components/mobile/use-tab-scroll-memory.ts`, `tab-scroll-memory.ts` |
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
| Share cards and link previews | `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx`, `src/lib/og/`; a club's own picture in `src/app/orgs/[handle]/opengraph-image.tsx` |
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
| `/orgs/[handle]` | One React page, `src/app/orgs/[handle]/OrgContent.tsx`, that adapts with `useIsMobile`. Officers get Club tools as a tray under the button row (`ClubToolsTray.tsx`) | The same page inside the app frame for a signed-in viewer (`club-frame.tsx`), with Campus's top bar; officers get the Arc on the window's right edge (`ClubToolsLauncher.tsx`) |
| `/orgs/[handle]/setup`, `/orgs/[handle]/tools/*` | One React page each, for the owner and officers: the setup list, and Club tools' screens (requests, members, officers, followers, settings) | The same pages inside the app frame. Officers mostly use the Arc's panel, which shows the same screens in place |
| `/orgs/[handle]/table-card` | A printable 5 × 7 in card with the club's QR, officers only | same |
| `/c/[code]`, `/c/welcome` | One React page each: a club link (sign up, or one button if signed in), and "Set up (club)?" / "Join (club)?" after onboarding | same |
| `/settings`, `/feed` | One React page inside `CampusAppShell` | same |
| `/campus/checkin/[id]`, `/campus/checkin/[id]/door` | One React page each: where a student types the code or the QR lands, and the officers' door screen | same |

The frames around the screens:

- Phone: `src/components/mobile/MobileShell.tsx` and `MobileTabBar.tsx`.
- Desktop: `src/components/campus-app-shell.tsx`, which adds `src/components/LeftNav.tsx` and the Otto corner (`src/components/network/OttoCorner.tsx`).
- Club pages on a computer: `src/app/orgs/[handle]/club-frame.tsx` puts the club page, its setup list and Club tools inside `CampusAppShell` when the server's device guess is a computer and the viewer is signed in. `ClubShell.tsx` loads the shell as its own download, so a phone never fetches it. A phone, a signed-out visitor or a wrong guess gets the page with no frame, as before.

Things to know before editing:

- `campus-home.tsx` is about 18,400 lines and `CampusMobile.tsx` about 5,100 (October 19, 2026). They are separate implementations of the same page. A change to the feed, the composer, the club list or the map usually has to be made in both.
- `CampusMobile.tsx` still imports shared pieces from `campus-home.tsx`, so a phone downloads part of the desktop file. Moving those pieces out is planned work (see the newest handoff).
- A feature can be right on one screen and broken on the other. Check both, and check a width near 900px.
- On a phone, the swipeable tabs of a page sit side by side under one page scroll. Each tab keeps its own place through `use-tab-scroll-memory.ts` (Campus, Network, Otto and Profile use it), kept for the browser tab's session. Without it, a long Feed left a short tab such as Orgs scrolled past its end, on a blank screen.

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
| `GOOGLE_FONTS_HREF` in `src/lib/theme/fonts.ts`, the logo's `@font-face` in `globals.css` | Pasted into the head of the three pages (`fonts.test.ts`) |
| `POST_TAG_IN_TEXT_RE`, `POST_TAG_LINK_RE`, `extractPostTags` and `blankPostLinks` in `src/lib/posts/edit.ts`, `captionTagRanges` in `caption-tag-ranges.ts` | The `tags-twin:start` / `tags-twin:end` block in `public/html/profile.html` and `public/html/_postViewer.js` (`static-profile-tags.test.ts` fails on drift) |
| `DELETED_LINE` in `src/lib/chat/deleted-note.ts` (the "Message deleted" note) | Drawn by hand in `public/html/messages.html` (`.dm-deleted`) |
| `src/lib/calendar/calendar-sync.ts` (the `vibe-calendar` channel message), the colour key in `calendar-key.ts` | A hand copy in `public/html/profile.html` |
| `src/lib/build/build-refresh.ts`, `src/components/build/BuildRefresh.tsx` | `public/html/_buildRefresh.js` (`static-build-refresh.test.ts`) |
| `src/lib/usage/touch.ts`, `src/lib/usage/touch-client.ts`, `src/components/usage/ActivityTouch.tsx` | `public/html/_usageTouch.js` (`static-usage-touch.test.ts`) |
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

- One SQL file per change in `supabase/migrations/`, named `<UTC timestamp>_<name>.sql`. There are 139 (October 23, 2026). Never edit an applied file; add a new one.
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
- **Club links are the gate's first step** (`20261021120000_club_links_gate.sql`). A sign-up from `/c/<code>` carries the link's code in its metadata; the gate asks `auth_hooks.club_link_claim`, and a live link lets a school address in even while sign-up is closed (section 7, Clubs). The step runs when sign-up is open too, so the app learns which club the person came for. A failure inside it counts as "no" and the other steps run as before, so it can never block a sign-up they allow. As with access codes, the typed code never stays in `auth.users` or `auth.identities`: a trigger swaps `club_code` for `club_code_hash`.
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

### The first confirmation (the pre-registration fix, live since October 21, 2026)

The problem: anyone could sign up with a student's school address before the student did and choose the password, and Supabase never replaces the password of an account still waiting for its code. The fix lives in the database, because no Vibe route sees an account being created.

- **The wipe.** The trigger `first_confirm_drops_password` on `auth.users` (`20261022110000_first_confirm_drops_password.sql`) runs when an address Vibe mailed a code or link to is confirmed for the first time. Inside Supabase's own write, before any session exists, it removes the stored password, resets the starter name to "Member", clears the Terms tick and stamps `users.password_needed_at` (a service-role-only column, `20261022100000_password_needed_column.sql`). Accounts made by an admin, the seeds and review accounts are never mailed, so nothing is removed from them.
- **Putting the student's password back.** The sign-up page and the sign-in page's code box set the password the person just typed, right after the code. Anyone who confirmed another way is sent by `/auth/terms` to `/auth/choose-password`, one screen with the password and the Terms box. `POST /api/me/accept-terms` refuses consent until a password exists, then clears the flag and records the Terms tick with the source `confirm`. The reads are in `src/lib/auth/password-needed.ts`; any doubt there reads as "nothing owed", because the database wipe is the security.
- **No self-service email change.** The trigger `no_self_service_email_change` (`20261022120000_no_self_service_email_change.sql`) refuses the write that starts a sign-in email change from a person's own session, which was a side door to the same gap. The Vibe team changes a sign-in email through the admin API, which this never blocks.
- **Supabase's own reset, magic-link and change-email emails carry no link and no code** (`supabase/templates/`; the dashboard must hold the same text, see the files' headers). Forgot password sends Vibe's own email through Resend (below).
- **Never** confirm a student by hand, set a password with SQL, or turn Supabase's "Confirm email" off while accounts are waiting.

### School email

- A person signs up with their school email. Confirming that address is the school check (`src/lib/auth/school-sign-in.ts`).
- Accounts that sign in with a personal address verify a school address separately: `src/app/auth/school-email/`, `src/app/api/auth/school-email/` (`request`, `confirm`, `confirm-code`), signed with `SCHOOL_EMAIL_VERIFY_SECRET`.
- Which domains count, and which school system and campus they map to: `src/lib/auth/school-email-domains.ts`, `src/lib/iu/campuses.ts`. `SCHOOL_EMAIL_DOMAINS` can narrow the list but never add to it.
- The yearly school check-in for school-email-only accounts: rules in `src/lib/auth/school-checkin.ts`, the daily job in `src/app/api/cron/school-checkin/` (`src/lib/auth/school-checkin-job.ts`), the person's side in `src/app/api/me/school-checkin/`. It has nothing to do with checking in at an event (section 7).
- Forgot password works on the sign-in address: `src/app/auth/forgot-password/`, `src/app/api/auth/password-reset/`.

### After sign-in

`src/lib/auth/post-login.ts` decides where a person lands. The gates that follow (Terms, school email, onboarding) are in `src/lib/auth/campus-access.ts`, described in section 2. Terms acceptance is recorded against `TERMS_VERSION` in `src/lib/legal/terms.ts`; raising that constant sends everyone through `/auth/terms` once.

## 7. Features

Short notes on how each area works. For file locations use the index in section 1.

**Feed and posts.** The feed is the main tab of `/campus`. `/feed` is a separate "global feed" page that is off unless `NEXT_PUBLIC_SHOW_GLOBAL_FEED` is `true` (`src/lib/feature-flags.ts`). Posts are published through `POST /api/me/publish-post`; likes, saves, reposts, comments and view counts are under `/api/posts/[id]/`. Tag and trending logic is in `src/lib/posts/` and `src/lib/trending/`.

- **One record per post on screen.** The phone feed card, the open post and the desktop feed row all read and write one like / save / repost / comment-count record in `src/lib/posts/engagement-store.ts`, so a tap in one shows in the others at once. A server read never overwrites a tap that is still in flight. It lives in the tab's memory only.
- **Reposts.** A post shows one quiet line ("Maya and 6 others reposted"). Tapping it opens "Reposted by", from `GET /api/posts/[id]/reposters`: it names only the people the viewer follows and gives everyone else as a number.
- **One hashtag rule.** A new post or an edit keeps at most 5 tags, each 2 to 32 of `a-z`, `0-9`, `_` with at least one letter (`isNewPostTag`). `extractPostTags` in `src/lib/posts/edit.ts` reads them from the caption. Both composers and the edit route use it, and `publish-post` ignores the tags a composer sends and reads the caption itself. Older posts keep their stored tags (the looser read rule, `isValidPostTag` in `tags.ts`). Tags are tappable inside the caption. The trending strip shows 5 and needs `TRENDING_MIN_AUTHORS` different people per tag: 1 during the pilot, raised to 2 on launch morning (launch checklist).

**Clubs (orgs).** The code says "org"; the product says "club". Clubs can be hidden; the access rules for hidden clubs are in `src/lib/orgs/hidden-gate.ts` and in a migration. Officer-only actions go through `src/lib/club-routes/officer-guard.ts` (routes) and `officerGate` in `hidden-gate.ts` (pages). The design and every decision behind this part are in `handoffs/2026-10-20-club-view/` (DECISIONS, BUILD-ORDER) and the wave handoffs it lists.

- **Roles: Owner and Officers.** `org_members.role` is `owner`, `admin` or `member`. The stored `admin` is what the screens call "Officer"; `mod` is gone and the database refuses it (`20261021100000_club_officers.sql`). Only the owner makes or removes officers: the members route checks it, and the `org_members_update` policy says it again as a second lock.
- **Follow vs Membership.** Following is not membership (`src/lib/orgs/following.ts`, `membership.ts`). Anyone can follow a club they can see: a follower gets the club's posts in their feed and can read its Board, while only members get into the chats and take part. On the club page the button row is Follow and Share, and joining has its own Membership box (`MembershipBox.tsx`, its words from `membershipBoxView` in `join-copy.ts`). Every screen and route asks one function, `orgJoinState` in `join-state.ts`, what a person can do. Asking to join also follows the club, and cancelling a pending request drops that follow. A request an officer turns down means a 14-day wait before asking again (`REQUEST_COOLDOWN_DAYS`, the same two weeks as a declined invite). Each owner and officer gets a notification, "(name) asked to join (club)" (type `org_join_request`, `20261024100000_org_join_request_notification.sql`); it shows in Otto, and as a phone push only where push is on. Member and follower counts show from 5 up (`FOLLOWER_COUNT_FLOOR` in `following.ts`); members see the exact member count and officers the exact follower count.
- **Club links** (`src/lib/club-links/`, `20261021110000_club_links.sql`). Two kinds, one mechanism. A **setup link** is made in Admin › Clubs (platform admins only), with a QR, for one club's president: one use, 7 days, and the person who uses it becomes the owner. A **members' link** belongs to one checked club: school email only, 3 weeks, 150 sign-ups; officers can turn it off and on or make a new code, and see only how many joined. Both open `/c/<code>`, and both work while sign-up is closed, through the sign-up gate's first step (section 6). A signed-out visitor gets the sign-up form under the club's name; a signed-in one gets one button (`POST /api/club-links/redeem`). A sign-up the link let in lands on `/c/welcome` when onboarding finishes: "Set up (club)?" (Make me the owner, Not me) or "Join (club)?". It is always asked, never done for them, because the person holding the phone may not be the one the link was made for; "Not me" gives the place back. The tables are `club_links` (a setup link keeps only a hash of its code; a members' link keeps its code so officers can show it again) and `club_link_uses` (one row per person a link let in: the address only while a sign-up is under way, then the account). Both are service-role only, and neither stores an IP address. `club_link_redeem_setup` makes the club, its owner row and its rooms in one transaction. The daily `waitlist-purge` cron deletes places never tied to an account after 30 days.
- **The setup list**, `/orgs/<h>/setup`: six steps for a new club (photo and cover, one line, who can join, officers, the first event, the members' link), for the owner and officers. Only a club a setup link made has the list; an older checked club sees only its members' link panel there.
- **The club page** is Instagram-style: cover, picture, two counts, bio, link, who can join, when it meets (`orgs.meeting_time`, 60 characters), "More about us", officers' Up next card, and the tabs Posts, Events and Board. It is a "night island": every background is dark in Light and Night alike, so the theme tokens resolve to Night's values on it. On a computer it sits inside the app frame (section 3).
- **Backgrounds** are one list, `src/lib/orgs/backdrops.ts` (10 to pick from). A club stores only the key, `orgs.backdrop_preset`, with a CHECK in the database, never CSS: a CSS string a page draws can be used to track readers. A new background needs that CHECK widened first (`20261026100000_club_backdrop_presets.sql` added the last five). The Edit page opens on Look: photo, cover and the swatches (`LookSection.tsx`).
- **Club tools.** On a computer, officers get the **Arc**: a planet fixed to the window's right edge, with seven tools floating out of it, each opening a card with real data. A tool's full screen opens in place, in a panel about 560px wide that grows out of the planet. The pure halves, with tests, are `club-tools-arc.ts` and `club-tools-panel.ts`. On a phone, the row's Club tools pill opens a **tray** under the row ("Needs you", the oldest join request with Approve and Decline, then the seven tools), and the `/orgs/<h>/tools` pages hold the full screens. Both use the screens in `src/components/orgs/tools/`. The older desktop window, `/campus?manage=<handle>`, still exists, and desktop Messages' "Manage club" still opens it.
- **Switching to a club you run.** On a phone, holding the Profile tab (or tapping your own name on your profile) opens "Switch to." (`ClubSwitcherSheet.tsx`). The Profile tab then stands for that club, with a coral dot while join requests wait. The choice is kept only on that phone, per account, in `localStorage` (`club-switch.ts`), and signing out clears it.
- **"Your clubs"** in the desktop left menu's profile card (`YourClubsMenu.tsx`): one row with up to three logos and a coral dot for waiting requests. It opens a floating list of the clubs you run (`GET /api/me/clubs-you-run`, with request counts) and the clubs you're in (`GET /api/me/clubs-in`, a light read). Both are service reads of the caller's own rows, and clubs Vibe hid are left out. It is not the Feed's "Your clubs" panel (Tonight, below).
- **Sharing.** The share sheet (`ShareSheet.tsx`) shows the club's link picture, Send it, Copy link and, for officers, "QR for your table". The **link picture** is drawn by `renderClubCard` in `src/lib/og/club-card.tsx`, which both `src/app/orgs/[handle]/opengraph-image.tsx` and `twitter-image.tsx` call. It shows only what the public club page shows (no counts, no people). A hidden or missing club gets the site's own card, the same bytes for both, so the picture can't tell a hidden club from an unused handle (`club-card-content.ts`, tested). It is read fresh on every ask and counts against the signed-out read limit. The image address carries the route file's hash, so a redrawn card needs an edit in that file or link previews keep the old one. The **table card**, `/orgs/<h>/table-card`, is a printable 5 × 7 in card with the club's QR, for officers only.
- **Up next** (officers): one card with the steps of an event night (Posted, Going, Check-in, Who came, Thank-you) and one button that is always the next thing to do (`up-next-steps.ts`).

**Events.** Created by clubs, with RSVP, attendee lists and `.ics` calendar files (`/api/events/[id]/`). A person's own calendar is `/api/me/calendar` and `/api/me/personal-events`. Events are written only through the `/api/events` routes, with the service role; the browser roles can't insert or update one.

- **Members only events** (live since October 22, 2026). An officer picks Everyone (the default) or Members only; the column is `events.visibility` (`everyone` or `members`, `20261025100000_event_visibility.sql`). The database enforces it: `event_visible` lets only the club's members (any role) and Vibe's platform admins see a members-only event, `event_audience_ok` lets only members RSVP (the RSVP policies) or check themselves in (`event_checkin_self_as`), and `chat_create_event_card` refuses to put one on the Board, which followers read. The routes also leave these events out of follower views, the Events list, `.ics` files, search and Otto. Switching an event to Members only removes non-members' RSVPs. Leaving a club removes your RSVPs to its upcoming Members only events, after a warning that lists them (`src/lib/orgs/leave-rsvps.ts`); being removed already did, through the `org_members_drop_club_access` trigger.
- **Event icons** (live since October 23, 2026). An officer may pick one of twelve icons (Meeting, Social, Food, Music, Sports, Games, Study, Talk, Service, Arts, Trip, Party); the event card and past events draw it in a small tile, and no pick draws the calendar. The database holds only the key (`events.icon`, null for none), never a shape, address or CSS. `events_icon_check` lists the same keys, in the same order, as `EVENT_ICON_KEYS` in `src/lib/events/event-icons.ts`, and `event-icons.test.ts` fails when they drift.
- **Event photos** (a picture for each event): in progress (Oct 23), not on main. The design points are in the newest handoff, under "In flight".

- **My Calendar** (`src/lib/calendar/`). The colour key: solid coral for Going, a coral outline for Interested, a plain chip with a thin bar in the person's colour for their own entries. The stored RSVP value is still `maybe`; the screen says "Interested". There is no event page yet, so clicking an event opens its club page at that event (`/orgs/<handle>?event=<id>`). `emitCalendarChanged()` in `calendar-sync.ts` tells this page and, over the `vibe-calendar` BroadcastChannel, other tabs and the framed Messages window, so an RSVP made anywhere reaches My Calendar without a reload.
- **Event check-in** (live since October 19, 2026). An officer taps "Start check-in" and the door screen (`/campus/checkin/<id>/door`) shows a 4-digit code and a QR code that change every 30 seconds. A student checks in by typing the code or opening the QR link, which lands on `/campus/checkin/<id>`. Officers can also tick "Mark as here" for people who said Going or Interested. Check-in is open from an hour before the start to an hour after the end. Anyone at the event can check in, except at a Members only event, where only members can. Officers see who came; everyone else sees only how many, and only from 5 up. Nothing records where a person is or when they checked in. A student can see and remove their own check-ins in Settings ("Event check-ins"). The tables are `event_checkins` (the record) and `event_checkin_sessions` (one secret per open check-in; closing it kills every code shown). Only the database functions write them, and the student's own check-in goes through `event_checkin_self_as`, which only the service role can call, so the route's limit on guesses can't be skipped. The numbers in `event-checkin.ts` mirror the migration, and `checkin-migration.test.ts` keeps them equal.
- **Tonight and the school calendars.** "What's the vibe tonight?" shows tonight's events: on the desktop Feed as the right-hand panel (with "Your clubs", the newest Board line of each club, on the left; `FeedSideLayout.tsx`), on the phone Feed as one card that opens a sheet, and as a "Tonight" block on both Events tabs. The first item is the school's own featured pick (only Indianapolis's Featured calendar counts as one), else tonight's home game (from 5 PM, or one on now), else the school event on now or starting soonest. Then come the other school events, then club events. Never by popularity (`tonight-view.ts`). Club counts show only from 5. `GET /api/school-events?campus=<id>` reads the school's own public iCal feeds on the server (`src/lib/school-events/sources.ts`, a fixed list a request can't change), each campus only its own: Indianapolis has IU Indy Jaguars athletics (iuindyjags.com) and IU Indianapolis events (events.iu.edu); Bloomington, on since October 19, 2026, has IU Athletics home games (iuhoosiers.com) and IU Bloomington Student Life and Featured (events.iu.edu). A calendar that is down is just missing; the route never answers 500 for it. Other campuses get `school_on: false` and the screens hide every school part.
- **The school calendars' off switch** (`src/lib/school-events/switch.ts`). Either of two things turns calendars off: the server env value `SCHOOL_EVENTS_OFF` (from the next deploy) or the `public.app_settings` row `school_events_off` (within about 30 seconds, no deploy). `true` turns all off. A list of calendar keys or campus ids (`indianapolis`, `iu-bloomington`) turns only those off: a comma list in the env value, a JSON array in the row (`'["iu-bloomington"]'`). A word the build doesn't know turns nothing off. Nothing set means on. Writing that row is a production write; the SQL and the rollback warning are in the file's header.

**Three things called "check-in".** Keep the names apart in code and in docs:

- **Event check-in:** a student checking in at an event (above). `src/lib/events/event-checkin.ts`, `/api/events/[id]/checkin`, `/api/me/event-checkins`, the `event_checkins` tables.
- **The yearly school check-in:** once a year, an account that signs in with a school email and has no personal email is sent a code to prove the address still works (section 6). `src/lib/auth/school-checkin.ts`, the daily cron `/api/cron/school-checkin`, `/api/me/school-checkin`.
- **The usage heartbeat:** a signed-in tab telling `POST /api/me/heartbeat` it is in use, for the use totals (below). Older comments call it "the check-in"; it has nothing to do with either of the others.

**Messages and club chat ("chat v2").** One Messages area holds direct messages, group chats and club rooms. The data and rules are in `src/lib/chat/` (rooms, pins, cards such as polls and sign-ups, read state). The UI polls for new messages (`use-room-poll.ts`). Two per-person switches control the screens, both server-only env values read by `src/lib/chat/flag.ts`:

- `chat_v2` (`CHAT_V2_ENABLED`, `CHAT_V2_ALLOWLIST`, `CHAT_V2_CLUBS`): the new inbox and club rooms.
- `chat_desktop` (`CHAT_DESKTOP_ENABLED`, `CHAT_DESKTOP_ALLOWLIST`): the React desktop Messages. It needs `chat_v2` too.

A screen learns `chat_v2` from `GET /api/me/features`; the desktop pages get `chat_desktop` as a server prop. The old screens remain as the fallback when a switch is off. The database side of chat is not behind the switches.

**Deleting your own message.** A sender can delete their own message in DMs, group chats, club rooms, event chats and the Board, on phone and desktop. `DELETE /api/me/threads/[id]/messages/[messageId]` calls `src/lib/chat/delete-own.ts`, which makes one database call, `public.delete_own_message`. In one transaction it removes the words, the file's key, a shared post, a card, the reactions, pins, notification rows and unsent phone notifications, and stamps `messages.deleted_at`. The row stays, and a grey "Message deleted" note shows in its place (a message the Vibe team or a club had removed stays hidden from everyone but its author) ("Post deleted" for a Board post, whose replies stay under it; `src/lib/chat/deleted-note.ts`). A database check, `messages_deleted_is_empty`, refuses a deleted row that still holds anything, and a browser login can no longer hard-delete a message through the REST API. The function hands back the file's storage key only when nothing else needs it (no other message uses it, the Vibe team or a club did not remove the message, and no report about it is open or was acted on); the route then deletes the file. Without the migration the route falls back to the old hard delete.

**Network.** People search, follows, mutuals and suggestions.

**Profile.** Handles, layout, cover themes, work experience, resumes. Columns a person may write to their own row are listed in `src/lib/profile/self-write-columns.ts`.

**Otto.** The in-app guide: the onboarding questions, a panel with upcoming events, requests and activity, typed reminders (`src/lib/otto/parse-reminder.ts`), and on desktop a corner button that opens a side panel. No outside AI service is called.

**Moderation.** Reports, a text filter, image quarantine, and account restrictions (suspend or ban). A restriction is mirrored into the user's auth `app_metadata` so the proxy sees it on the next request. Bans are keyed on a keyed hash of the email, using `RESTRICTION_PEPPER`; read its comment in `.env.example` before setting it, because it can never be rotated. The admin page (`/admin`) has tabs for Reports, Clubs, Users, Waitlist, Numbers, Usage and Log, and is open to platform admins only. The Clubs tab is also where setup links are made and cancelled (`club-links-card.tsx`; Clubs, above).

**Billing (Vibe+).** Stripe Checkout, the customer portal and a webhook (`/api/billing/`). Prices are found by lookup key, never by an id in code or env. Entitlements are stored in the database and read through `requirePlus()`, which fails closed. Checkout is off unless `BILLING_ENABLED` is exactly `true` and both Stripe values are set; it is off in production.

**Legal pages and the policy check.** The pages are React files under `src/app/legal/`. The Privacy Policy is split across `src/app/legal/privacy/sections-*.tsx`, with its date in `page.tsx`. The source text is `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`. A script, `handoffs/legal-2026-10-04-privacy-v3/check/check.mjs`, compares the rendered page with that text word for word. Run it against a dev server with `--url http://localhost:3000/legal/privacy`. The one-time cookie notice on signed-out pages is `src/components/legal/CookieNotice.tsx`.

**The page-open tally.** Vibe's own visit counter, with no outside analytics tool. `OpenBeacon` posts once per page load from three pages (`/`, `/waitlist`, `/auth/signup`) to `/api/tally/open`. The table `page_open_tally` holds a day, a page name, a link label and a number, and nothing about the visitor. Its rate limit is keyed on a daily scrambled code, not on an IP address (`src/lib/tally/network-code.ts`).

**The use totals.** How many people use Vibe each day and week, counted as it happens. While a signed-in tab is on screen it sends a heartbeat at most once every four minutes, from any page: `<ActivityTouch />` in the root layout, its twin `_usageTouch.js` on the static profile, and `countOpen` where Otto and the map are opened (at most once per feature per tab every ten minutes). The heartbeat posts only a device kind worked out from the screen (phone, desktop, installed) and the open, if any, to `POST /api/me/heartbeat`. The route calls `public.usage_touch` with the service role and the id from `getUser()`; the function refuses anon and authenticated inside. It moves the last-active time forward ("active now") and, on a person's first heartbeat of a UTC day or Monday week, adds one to the day, school, device, week and sign-up-week rows of `usage_day_tally`. A day's Otto or map opens stop at ten times that day's active people, and an open turned away leaves a mark on the day. The table holds a day, a metric, a key and a number, and nothing about a person; founders and store-review accounts are never counted. Browsers can no longer write the last-active time themselves. The Usage tab reads it through `admin_usage_tally`. The Privacy Policy, section 3d ("Use totals"), says what is counted. "Active now" is shown only from 5 up, because every page sends the heartbeat: `users_active_count` counts each campus on its own and leaves out any where fewer than 5 people other than the caller are active, or fewer than 5 other than the caller are not (so a campus under 10 people never shows, no list of campuses uncovers a small one, and the caller's own heartbeat can't either), `/api/stats/campus` floors its answer at 5 too (that covers only what the header prints until the migration is applied), and the campus header drops " · N active now" under 5 (`src/lib/usage/active-now.ts`, Privacy Policy 3d "Last active").

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
- **Fonts.** Two faces: Fraunces for titles (with its SOFT axis on every title, upright and italic) and DM Sans for everything else. They come from one Google Fonts link, `GOOGLE_FONTS_HREF` in `src/lib/theme/fonts.ts`, which `src/app/layout.tsx` loads and the three static pages paste (`fonts.test.ts` fails on drift). It asks for weight ranges, not lists, so real bold shows on the static pages too, and bold is never faked (`font-synthesis-weight: none`). A coral accent word inside a bold title stays upright.
- **The logo's own font file.** The "vibe." wordmark draws from `public/fonts/vibe-wordmark-v1.woff2` (`WORDMARK_FONT_PATH`): Fraunces cut to its five characters, self-hosted, declared in `globals.css` and the static pages, and preloaded on sign-in and sign-up. It is cached for a year, so a re-cut ships under a new name (`-v2`).
- **JetBrains Mono stays off the app.** It loads only on the landing and the waitlist pages (which share the landing's look), from `src/components/landing/soft-font.ts`, together with the landing's own soft headline face (`fraunces-soft.woff2`). No other page loads it.
- **Motion** (`src/lib/motion/`). Three springs cover the app: `SPRING_SNAPPY` (taps, toggles), `SPRING_SOFT` (things arriving) and `SPRING_POP` (the like heart). Use those names; don't invent numbers in a component. Animate transform and opacity only, never blur. `MotionRoot`, mounted once in the root layout, makes every Motion animation follow the device's reduce-motion setting. CSS press feedback is `.vibe-press` and `.vibe-toggle` in `globals.css`: the snappy spring sampled into a `linear()` curve (`spring-curve.ts`; change both together), with a plain ease-out on older Safari.

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
- **`npm test` silently skips the tests under `src/app/orgs/[handle]/`** (October 23, 2026): `node --test` reads the brackets in the path as a glob. Until the `test` script in `package.json` is fixed, run them by hand with the brackets escaped, for example `node --test 'src/app/orgs/[[]handle]/club-page/club-tools-arc.test.ts'`.

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
- `public.app_settings` holds the switches that act without a deploy: `signup_open` (section 6) and `school_events_off` (section 7). Changing either on production is a production database write, so it needs a founder's OK at that moment.

**Repo layout**

- `docs/` is ignored by git on a Mac (it is the same folder as the private `DOCS/`). Put developer docs at the root or next to the code.
- Nothing private goes under `public/`.
- `handoffs/` is committed and a push that touches only it does not deploy.
- `mobile/` is its own project. A bare `mobile/` ignore pattern would also match `src/components/mobile/`; the existing patterns are anchored for that reason.
