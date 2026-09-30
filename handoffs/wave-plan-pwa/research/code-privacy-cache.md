# PWA research: privacy and caching (code-privacy-cache)

Reader: privacy/caching. Date: 2026-09-24. Repo read at `main` @ 9c0e645, read-only.
Production touched only with plain anonymous GETs of public pages and public static files:
`/`, `/auth/login`, `/legal/terms`, `/robots.txt`, `/icon.png`, `/apple-icon.png`, `/favicon.ico`,
`/vibe-icon.svg`, `/html/_postViewer.js`, and the `/_next/static/immutable/**` chunks those pages reference.
No API route on production was called.

---

## 0. The short version (read this first)

- **Almost everything Vibe serves is personal.** Every GET under `/api/` changes with who is asking
  (blocks, campus, hidden clubs, "liked by me", private columns). Several pages also carry private
  data in the HTML itself (Settings puts your login email and school email in the page).
  A service worker must not keep copies of any of it. The only things safe to keep are the
  build's own code files, fonts, icons, and an offline page we write ourselves.
- **Today's headers would mislead a service worker.** Only 9 of the 147 API route files set a
  cache header. The rest go out with Vercel's default `public, max-age=0, must-revalidate`. The word
  "public" on a student's private data is harmless to browsers today, but a service worker rule like
  "cache anything marked public" would store it. So the service worker must decide by URL
  (an allow-list), never by trusting the header.
- **Signing out has five separate code paths** and none of them clears everything this browser holds
  about the person (the profile page's `vibe_user_v1` copy survives sign-out today). The PWA work should
  add one shared "leave this device clean" helper and call it from all five, plus account deletion and
  the suspension notice. Exact lines are in section (c).
- **Stale code is the other danger.** If the service worker keeps HTML pages, an installed phone can get
  stuck on an old version. Next.js already reloads the page when the client and server builds differ,
  but that reload goes through the service worker; if it answers from cache, the phone loops on the old
  build. Rule: pages always come from the network; the only cached page is a small offline notice.
- **iPhone detail that raises the stakes (older source, still to be confirmed on a current iPhone):** a
  2020 write-up of iOS 14 says the home-screen app and Safari keep separate cookies but share the
  service worker and its cache. If that's still true, one cache serves two different sign-ins. That's
  one more reason never to cache anything personal.

---

## (a) API route families: who each one is private to, and today's cache headers

**In plain English:** every family below changes with who is asking. Nothing under `/api/` is safe for
a service worker to store. The table shows what each family sends today, so the plan knows which
routes need headers added. The service worker must not rely on those headers.

How the header gets set (verified in code):
- Next 16.3.4 dynamic route handlers get **no** `Cache-Control` from Next. The non-ISR branch just
  sends the response (`node_modules/next/dist/build/templates/app-route.js:266-268`). Next only adds
  one for ISR entries (`:333-334`) and draft mode (`:325`).
- Vercel then applies its default: "The default value is `cache-control: public, max-age=0,
  must-revalidate`" (https://vercel.com/docs/caching/cache-control-headers, last_updated 2026-09-14).
  Seen live on prerendered pages and public files (see (e)). I didn't GET a production API route
  (out of scope), so **what a function response carries on the wire is UNVERIFIED**, but the docs say it
  is the same default.
- Dynamic pages are different. Next sends `private, no-cache, no-store, max-age=0, must-revalidate`
  (`node_modules/next/dist/server/lib/cache-control.js:14-15`), and I saw that live on `GET /`
  (force-dynamic, `src/app/page.tsx:3`). `next.config.ts:67-74` asks for `public, max-age=0,
  must-revalidate` on `/`, but the dynamic page overrides it.

| Family (route files) | Who it is private to | Cache-Control set in code today | Evidence |
|---|---|---|---|
| `/api/admin/**` (12) | platform admins only (`requirePlatformAdmin`) | none → Vercel default | `src/app/api/admin/users/route.ts:4-8` |
| `/api/auth/**` (5, all POST) | the session | none | `src/app/api/auth/logout/route.ts:10-14` |
| `/api/billing/checkout`, `/portal` (POST) | the payer; return Stripe URLs | none | `src/app/api/billing/checkout/route.ts:145-146` |
| `/api/billing/webhook` (POST from Stripe) | server-to-server | force-dynamic | `src/app/api/billing/webhook/route.ts:20` |
| `/api/feed` | viewer's campus lane, follows, "liked by me" | none | `src/app/api/feed/route.ts:100-119` |
| `/api/me/**` (68 files) | the signed-in student (DMs, notifications, profile viewers, bookmarks, Otto, calendar, blocks) | none, except the 3 rows below | e.g. `src/app/api/me/profile-bootstrap/route.ts:36-42` |
| `/api/me/calendar/ics` | the student's RSVPs + personal events | `private, no-store` | `src/app/api/me/calendar/ics/route.ts:124` |
| `/api/me/onboarding-state` | the student | `no-store` | `src/app/api/me/onboarding-state/route.ts:84` |
| `/api/me/threads/[id]/messages/[messageId]/media` | channel members; 307 to signed R2 URL | `private, max-age=300` on the 307, `no-store` on 404/500 | `…/media/route.ts:17,25,32,92` |
| `/api/me/threads/**` (other) | channel members | none | `src/app/api/me/threads/[id]/messages/route.ts:38-40` |
| `/api/users/[handle]/**`, `/api/users/by-id`, `/api/users/search` | viewer-dependent (blocks, follow state, restriction, private columns filtered per viewer) | none | `src/app/api/users/[handle]/bootstrap/route.ts:80-93,138-147` |
| `/api/resume/[...path]` | owner sees original; others see redacted copy; 307 to Supabase signed URL (300 s) | `private, no-store` on every answer | `src/app/api/resume/[...path]/route.ts:25-26,218-254` |
| `/api/posts/[id]` | viewer-dependent; hidden-club answers | `private, no-store` only when hidden club | `src/app/api/posts/[id]/route.ts:103-104,253` |
| `/api/posts/[id]/comments` | viewer-dependent | `private, no-store` only when hidden | `src/app/api/posts/[id]/comments/route.ts:226` |
| `/api/posts/[id]/media` | drafts: author only; hidden club: members; 307 to signed R2 URL | `private, no-store` only for draft/hidden; **public posts get none** | `src/app/api/posts/[id]/media/route.ts:60-92` |
| `/api/orgs/[slug]/asset/[kind]` | public for visible clubs; members/admins for hidden | none on the 307 (1 h signed URL) | `src/app/api/orgs/[slug]/asset/[kind]/route.ts:52-80` |
| `/api/orgs/**` (other; 23 files in total) | membership/officer-dependent | none | route list |
| `/api/events/**` | RSVP state per viewer | `/[id]/ics`: `private, no-store`; rest none | `src/app/api/events/[id]/ics/route.ts:78` |
| `/api/campuses` | viewer-scoped list | `no-store` | `src/app/api/campuses/route.ts:71,97` |
| `/api/campus-map/**`, `/api/stats/campus`, `/api/trending/hashtags`, `/api/search`, `/api/handle/check` | viewer's campus / viewer | none | `src/app/api/trending/hashtags/route.ts:15-26` |
| `/api/health/**` (5) | ops probes | `health/supabase` fetches no-store upstream; responses none | `src/app/api/health/supabase/route.ts:31` |
| `/onboarding/classic` (route handler, HTML) | per-user boot JSON injected into onboarding.html | `no-store` | `src/app/onboarding/classic/route.ts:46,125-132` |

Notes on (a):
- The client side mostly asks for `cache: "no-store"` on its fetches (e.g. `src/components/mobile/MessagesMobile.tsx:371`,
  `src/app/campus/campus-home.tsx:4332-4339`). That only affects the browser's HTTP cache. **A service worker's
  `fetch` handler still sees these requests and could cache them.** A SW must look at `request.cache` or,
  better, never cache `/api/`.
- **Private data inside server HTML:** `src/app/settings/page.tsx:25-33,73-74` selects `email` and `school_email`
  (private columns) into the rendered page. `/plus` (`src/app/plus/page.tsx:65`) renders billing state and `/admin`
  (`src/app/admin/page.tsx:15`) renders moderation data. So a cached navigation response is a copy of private data.
- **Redirect media routes** (`/api/posts/*/media`, `/api/me/threads/*/messages/*/media`, `/api/orgs/*/asset/*`,
  `/api/resume/*`): the browser follows the 307 to R2 or Supabase. A SW doing `fetch(event.request)` would get the
  final image or PDF body and, if it cached it, would keep a hidden club's photo, a DM photo after "Clear chat",
  a moderator-removed post, or an unredacted resume **after access was revoked**. Today `max-age=300`
  (`…/media/route.ts:12-17`) deliberately limits that window to 5 minutes, and a SW cache would erase that limit.
- Future push routes (e.g. `/api/me/push-subscriptions`) belong in the same never-cache group.

---

## (b) Auth cookies and how the session refreshes

**In plain English:** your sign-in lives in a cookie. The server renews it quietly as you use the app.
That renewal only happens when a request actually reaches the server. If the service worker answers
page loads from its own cache, three things get skipped: the server never renews the sign-in, never
sends a signed-out student to login, and never sends a suspended student to the notice page. So page
loads and anything that touches sign-in must always go to the network.

Cookies (from `@supabase/ssr` 0.6.1 + `@supabase/supabase-js` 2.105, `package.json:18-19`):
- Name: `sb-<project-ref>-auth-token`. The ref is the first label of `NEXT_PUBLIC_SUPABASE_URL` (prod ref
  starts `rqop…`, `.env.local:1`). The template is `sb-${baseUrl.hostname.split(".")[0]}-auth-token` in
  `node_modules/@supabase/supabase-js/dist/index.cjs`. A long session is **split into chunks**
  `…-auth-token.0`, `.1` (MAX_CHUNK_SIZE 3180, `node_modules/@supabase/ssr/dist/main/utils/chunker.js:8`).
- PKCE sign-ins (`flowType: "pkce"`, `createBrowserClient.js:37`) also set `sb-<ref>-auth-token-code-verifier`
  while an email-link or code exchange is in flight (`cookies.js:263`).
- Options: `path=/`, `SameSite=Lax`, **`HttpOnly=false`** (the browser client reads and writes it through
  `document.cookie`), `Max-Age` 400 days (`node_modules/@supabase/ssr/dist/main/utils/constants.js`).
- A service worker has no `document.cookie`, so it **cannot tell who is signed in**. Any per-user logic in
  the SW has to be told the user id by the page (`postMessage`).

Refresh path:
1. `src/proxy.ts:218-219` calls `updateSession` on every request the matcher lets in
   (`src/proxy.ts:314-318`). The matcher skips only `_next/static`, `_next/image`, `favicon.ico` and image
   extensions, so **`/api/**`, pages, `/html/*.html`, `/html/*.js`, a future `/sw.js` and
   `/manifest.webmanifest` all go through it.**
2. `src/lib/supabase/middleware.ts:19-38` builds a server client and calls `auth.getUser()` (a GoTrue
   network call). If the access token has expired, the lib refreshes it and `setAll` writes the new
   cookies onto both the forwarded request and the response (`middleware.ts:24-31`).
3. Route handlers and RSC use `src/lib/supabase/server.ts:16-35`. Server Components can't set cookies
   (`:29-31`), so the proxy owns refresh.
4. On pages that load it, the browser client auto-refreshes too (`autoRefreshToken: isBrowser()`,
   `createBrowserClient.js:38`). It is only used on auth pages and a few components (`src/lib/supabase/browser.ts:11-16`;
   users listed by grep: `src/app/auth/*`, `src/components/auth/*`, `src/app/profile/[handle]/ProfileHandleSwitch.tsx`).
5. **The installed lib does not attach no-cache headers to refresh responses.** Supabase's current docs say
   `setAll` receives a second `headers` argument (`Cache-Control`, `Expires`, `Pragma`) "which must be applied
   to the HTTP response to prevent CDNs from caching the response and leaking the session"
   (https://supabase.com/docs/guides/auth/server-side/creating-a-client, no date shown, read 2026-09-24).
   0.6.1 calls `setAll` with one argument (`node_modules/@supabase/ssr/dist/main/cookies.js:334-345`). The
   version that added it is **UNVERIFIED** (a search snippet says 0.10.0). This is not a SW bug by itself.
   It does mean a refreshed-cookie response can go out marked `public, max-age=0` (e.g. `/html/_postViewer.js`,
   prerendered `/auth/login`). Upgrading `@supabase/ssr` and applying `headers` in `middleware.ts:24-31` is a cheap
   hardening to fold into the PWA wave.
6. `Set-Cookie` is a forbidden response header, so a SW **cannot see** whether a response carried a refresh.
   That's why the SW can't decide per-response and must decide by URL.

Rules this gives the SW:
- Never call `respondWith` for `request.mode === "navigate"` except as a network-first fallback to a static
  offline page **after** the network has failed. Never serve a cached HTML page as if it were current.
  (The cached copy would skip `src/proxy.ts:235-245` (restriction), `:289` (login bounce for `/html/*`) and
  `:298-303` (`/profile` login bounce).)
- Always pass through `/auth/**` untouched, including `/auth/callback?code=…` and `/auth/confirm?token_hash=…`.
  Those URLs carry one-time sign-in secrets (`src/app/auth/callback/page.tsx:160-205`; Sentry already scrubs these
  keys, `src/lib/sentry-config.ts:11-24`). Keep them out of any cache key or log the SW writes.
- Iframes are navigations too. `src/app/messages/MessagesSwitch.tsx:42` and the onboarding shell iframe
  `/html/*.html`, so the navigate rule applies to them.
- Exclude `sw.js` from the proxy matcher (add `sw\\.js|manifest\\.webmanifest` to the negative lookahead at
  `src/proxy.ts:316`). Browsers fetch the SW script on in-scope navigations and bypass the HTTP cache for it by
  default ("Most browsers, including Chrome 68 and later, default to ignoring caching headers when checking for
  updates", https://web.dev/articles/service-worker-lifecycle, last updated 2016-09-29). Each of those fetches would
  otherwise cost a GoTrue `getUser` round trip. `isFileRequest` already exempts `.js`/`.webmanifest` from the
  restriction redirect (`src/proxy.ts:84-98`), so a suspended student still gets the real script.
- iOS: home-screen apps keep **separate cookies** from Safari ("Cookies, Web Storage, and IndexedDB are still
  isolated", https://firt.dev/ios-14/, 2020-09-16). A student signed in in Safari is signed out in the installed
  app and must sign in there. Magic links open in Safari, not the app. The same source says "PWAs share Service
  Worker's registration and CacheStorage with Safari". **Whether that sharing still holds on iOS 18/26 is UNVERIFIED**;
  if it does, one Cache Storage serves two cookie jars (two different accounts possible).

---

## (c) Where the cache purge and push unsubscribe must hook in

**In plain English:** there is no single "sign out" function today. Five buttons sign people out, two
buttons delete accounts, and a suspension happens on the server without the phone doing anything. Each
needs to call one new helper (call it `leaveDeviceClean()`) before it navigates away. The server needs
to drop that phone's push subscription too, so the next person using the phone never gets someone
else's messages. The good news: every client path already calls `clearDraft()` right before it
navigates. That's the natural spot to put the new helper.

Order that works (the server delete needs the session, so it runs before logout):
1. Read the device's push endpoint (`registration.pushManager.getSubscription()`).
2. Tell the server to drop it. Cleanest: let `POST /api/auth/logout` accept `{ endpoint }` and delete the
   row before `signOut()` (`src/app/api/auth/logout/route.ts:10-13`). That route is already exempt from the
   restriction gate (`src/proxy.ts:173`), so a suspended student can do it too.
3. `subscription.unsubscribe()`.
4. Delete every Cache Storage entry the SW owns (the page can call `caches.keys()` / `caches.delete()`
   directly; no SW message is needed).
5. Clear per-user browser storage: `clearDraft()` (`src/lib/onboarding/draft.ts:298`) **plus** the static
   pages' keys `vibe_user_v1`, `vibe_posts_v1`, `vibe_relationships_v1` (`public/html/_persistence.js:11-16`).
   See "adjacent finding" below.
6. Navigate (the existing `window.location.href = …`).
Optional belt-and-braces: send `Clear-Site-Data: "storage"` on the logout response. It clears
localStorage/sessionStorage/IndexedDB and **unregisters the service worker**
(https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data, modified 2025-11-21).
Support: Chrome 61, Firefox 63, Safari/iOS 17 (https://raw.githubusercontent.com/mdn/browser-compat-data/main/http/headers/Clear-Site-Data.json,
read 2026-09-24). Avoid the `"cache"` directive: BCD marks Chrome 127+ as partial, with cache-clearing
issues and possible hangs. Three things are **UNVERIFIED**: whether `"storage"` also clears Cache Storage
in Safari, whether unregistering kills the push subscription on iOS, and whether a `fetch()`-initiated
(not navigation) response applies the header in Safari. So keep steps 1-5 in code and treat the header
as a backup.

| Flow | Client hook (file:line) | Server hook (file:line) | Notes |
|---|---|---|---|
| Settings → Sign out | `src/components/settings/SettingsClient.tsx:1172-1191` (`onSignOut`; `clearDraft()` at 1189, navigate 1190) | `src/app/api/auth/logout/route.ts:10-14` | Stays put if logout fails (`:1179-1184`). Keep that: purge only after `r.ok`. |
| Suspension notice → Sign out | `src/app/account/suspended/suspended-actions.tsx:52-65` (clearDraft 63) | same logout route | Best-effort: navigates even if logout threw. Purge anyway. |
| Terms interstitial → Sign out | `src/app/auth/terms/accept-terms-form.tsx:64-78` (clearDraft 76) | same | Same best-effort shape. |
| Verify-school 403 card → "sign out and sign in" | `src/app/auth/verify-school/page.tsx:229-250` (`signOut({scope:"local"})` at 235) | **none**: browser-only sign-out, no server call | This is the **account-switch** path. It never reaches `/api/auth/logout`, so the helper must do the server push delete itself (step 2 via a dedicated `DELETE /api/me/push-subscription` before `signOut`). |
| "Not you? Sign out" (email-link problem cards) | `src/components/auth/EmailLinkProblem.tsx:64-88` (`useSignOutHere`, signOut at 75) | none (browser-only) | Also an account-switch path; same as above. |
| Settings → Delete account | `src/components/settings/SettingsClient.tsx:1240-1261` (clearDraft 1255, navigate 1256) | `src/app/api/me/route.ts:58-153` (`DELETE`; `auth.admin.deleteUser` at 137, `signOut()` at 151) | Server: make `push_subscriptions.user_id` `ON DELETE CASCADE` so deletion drops them. The comment at `:134-136` says content cascades from the auth user. Client: purge after `data.ok`. |
| Suspension notice → Delete account | `src/app/account/suspended/suspended-actions.tsx:67-91` (clearDraft 86, navigate 87) | same `DELETE /api/me` (exempt: `src/proxy.ts:174`) | |
| Suspended / banned (server-side) | Arrival at `/account/suspended`: mount effect in `suspended-actions.tsx` (rendered by `src/app/account/suspended/page.tsx:369`). Also any `403 {code:"account_restricted"}` (`src/proxy.ts:186-194`) | `restrictUser` in `src/lib/moderation/actions.ts:330-418`: add a step next to `mirrorToAuth` (`:398-401`) that deletes (ban) or pauses (suspension) that user's push rows; `liftRestriction` `:452-500` needs nothing (the phone resubscribes) | Sign-in stays open for banned students by design (`actions.ts:33`, `:410-413`), so the server must stop sending. The phone can't be relied on. The push sender should also re-check the restriction before each send. |
| Sign-in as someone new (defense in depth) | After sign-in: `src/app/auth/login/page.tsx:126-165` (`onSubmit`, assign at 164), `:167-184` (`onContinue`), `src/app/auth/callback/page.tsx:236-245`, `src/app/auth/confirm/page.tsx:54-214` | Push subscribe route: **upsert by endpoint and overwrite `user_id`** | A hash-token link never overwrites a different live session (`callback/page.tsx:202-213`), and login offers "Continue" to a signed-in visitor instead of a form (`login/page.tsx:93-109`). So a switch normally passes through a sign-out first. A `?code=` link completes only in the browser that asked for it; whether it can replace a different live session is UNVERIFIED. Still: on app boot, have the page post the current user id to the SW. If it differs from the id stored with the caches, purge. |

Push-specific cautions:
- One device + one SW registration = one endpoint. If user A's row survives a failed logout, user B's new
  subscription on that phone reuses the same endpoint. Without an upsert-by-endpoint that reassigns
  `user_id`, A's notifications land on B's lock screen.
- Keep push payloads content-free ("New message from a club"). Fetch details after the tap, through the
  normal authenticated API. Then a stale subscription leaks nothing but a nudge. Lock-screen text is visible
  without unlocking.
- iOS: push only works for Home Screen web apps, and the permission prompt must come from a user tap
  (https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/, 2023-02-16). Re-subscribing after
  a sign-out/sign-in needs a tap too.

**Adjacent finding (pre-existing, same privacy class, not caused by the PWA):** the React profile bridge
writes the signed-in student's profile to `localStorage["vibe_user_v1"]` (`src/app/profile/profile-html-bridge.tsx:93`),
and the static pages keep `vibe_user_v1` / `vibe_posts_v1` / `vibe_relationships_v1` (`public/html/_persistence.js:11-16`,
writes at e.g. `public/html/profile.html:4063,9165`, `public/html/messages.html:3465`). No sign-out or delete path
clears them. Only `?clear=1` calls `vibeClearAll()` (`_persistence.js:28,35`). On a shared laptop, the next person
to open the profile page sees the previous student's cached profile until bootstrap overwrites it. Seen in code;
not reproduced in a browser.

---

## (d) Other websites the pages load, and what the service worker must leave alone

**In plain English:** pages pull from six outside services: Google Fonts, Supabase (sign-in plus
photos and resumes), Cloudflare R2 (photos, videos, uploads), Sentry (error reports), Stripe (payment
pages) and a PDF viewer from cdnjs. The simplest safe rule: the service worker ignores every request
to another website and every request that isn't a plain read. The browser's normal cache already
handles these well. Several carry short-lived signed links that must expire on schedule.

| Origin | What loads from it | Where in code | SW rule |
|---|---|---|---|
| `https://fonts.googleapis.com` (CSS) → `https://fonts.gstatic.com` (woff2) | Fraunces + DM Sans | `src/app/layout.tsx:42-45`; `public/html/profile.html:17`, `messages.html:13`, `onboarding.html:13` | Pass through. `<link>` without `crossorigin` is a no-cors request, so the SW would get an **opaque** response it can't status-check. Better: self-host both families with `next/font/google` (the app already self-hosts JetBrains Mono, `src/app/layout.tsx:3,9`). That drops a third-party origin and simplifies a future CSP. |
| `https://<ref>.supabase.co/auth/v1/*` | browser sign-in, token refresh, sign-out, verifyOtp | `src/lib/supabase/browser.ts:11-16`; `src/app/auth/login/page.tsx:137-141`; `src/app/auth/confirm/page.tsx:54` | Pass through, never cache (bearer tokens). |
| `https://<ref>.supabase.co/storage/v1/object/public/profiles/*` | avatars, profile photos, post images (public bucket, UUID paths, `upsert:false`) | `src/app/api/me/profile-upload/route.ts:156-171`; `src/lib/profile/storage-upload.ts:44-53`; `public/html/_postViewer.js:1080` | Pass through. Public, but removed by account deletion (`src/app/api/me/route.ts:113-131`) and by moderation. A SW copy would outlive both. |
| `https://<ref>.supabase.co/storage/v1/object/sign/resumes/*` | resume PDFs via the `/api/resume` 307 (signed 300 s) | `src/lib/profile/resume-storage.ts:170-175`; `src/app/api/resume/[...path]/route.ts:25,254` | Pass through, never cache. It's often a top-level navigation (Accept: text/html, `route.ts:34-44`). |
| `https://<account>.r2.cloudflarestorage.com/<bucket>/…?X-Amz-…` | signed GETs behind the media routes (1 h), direct **PUT** uploads from the browser | `src/lib/r2.ts:41-43,209-233`; PUTs at `src/components/mobile/MessagesMobile.tsx:1137-1140`, `src/components/mobile/PostComposerMobile.tsx:232-234`, `public/html/messages.html:3395-3396` | Pass through. Never `respondWith` a PUT. Never cache a signed GET (the signature is a time-limited key). |
| `https://oNNN.ingest.us.sentry.io` | error and trace envelopes (POST) | DSN host from `NEXT_PUBLIC_SENTRY_DSN` (`.env.local`); init `src/instrumentation-client.ts:5` | Pass through (cross-origin POST). |
| `https://checkout.stripe.com`, `https://billing.stripe.com` | top-level navigations only; no Stripe.js is loaded | `src/app/plus/PlusActions.tsx:53-54`; returns to `/plus?checkout=success&session_id={CHECKOUT_SESSION_ID}` (`src/app/api/billing/checkout/route.ts:145-146`) and `/plus` (`src/app/api/billing/portal/route.ts:94`) | Not in SW scope (other origin). The return trip is a navigation to `/plus`, which is force-dynamic (`src/app/plus/page.tsx:65`) and must hit the network. |
| `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/` | pdf.js + worker for resume previews | `public/html/profile.html:4781,4856`; `src/lib/pdfjs-cdn.ts:14` | Pass through (versioned URL; the HTTP cache is enough). |
| Links out: `calendar.google.com`, `report.cybertip.org`, `purdue.edu` | navigations away | grep of `src` | Not SW business. |

Not in use (checked): Supabase Realtime (no `.channel(` in `src`/`public/html`), Server Actions (no `"use server"`),
Vercel Analytics/Speed Insights (not in `package.json`).

---

## (e) Static assets: what's versioned and what isn't

**In plain English:** the app's main code files have a fingerprint in their names. A new version always
gets a new name, so keeping old copies can't cause trouble, and they're safe to cache for good. The
older desktop pages (`/html/profile.html`, `messages.html`, `onboarding.html`) and their 11 helper
scripts have **no** fingerprint. Today the browser re-checks them on every load, which keeps them in
step. If the service worker kept a copy of a helper, a phone could run a new page with an old helper
(or the reverse) after a deploy. Leave them to the browser, or cache them only as one stamped set.

What I saw live (anonymous GETs, 2026-09-24):

| URL | Cache-Control | Other |
|---|---|---|
| `/_next/static/immutable/chunks/1g1mity_4h5yv.js` | `public,max-age=31536000,immutable` | `access-control-allow-origin: *`, `x-vercel-cache: HIT`, `age: 409570` |
| `/_next/static/immutable/media/70bc3e132a0a741e-s.p.269kn9uafm0ti.woff2` (next/font) | `public,max-age=31536000,immutable` | same |
| `/html/_postViewer.js` | `public, max-age=0, must-revalidate` | ETag, `x-vercel-cache: MISS` |
| `/icon.png`, `/apple-icon.png`, `/favicon.ico`, `/vibe-icon.svg` | `public, max-age=0, must-revalidate` | ETag |
| `/auth/login`, `/legal/terms` (prerendered) | `public, max-age=0, must-revalidate` | ETag, `x-nextjs-prerender: 1`, `x-nextjs-stale-time: 300`, `vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch` |
| `/` (force-dynamic) | `private, no-cache, no-store, max-age=0, must-revalidate` | same `vary` |

- **`/_next/static/immutable/**`**: Next 16.3 with Turbopack writes content-hashed assets there. The config type says
  such assets "don't need a `?dpl` parameter and can be safely requested across deployments"
  (`node_modules/next/dist/server/config-shared.d.ts:1371-1376`; Turbopack-only, `node_modules/next/dist/server/config.js:1280-1283`).
  The proxy matcher skips `_next/static` (`src/proxy.ts:316`), so there is no session work on them. **Safe for cache-first.**
- **`public/html/*.js` helpers (11 files):** loaded by bare `<script src="/html/_x.js">` with no version query and no hash:
  `public/html/profile.html:18-31,10987`, `public/html/messages.html:14-20`, `public/html/onboarding.html:14-21`, plus
  `/html/_otto-tour.js` injected from `src/app/campus/campus-home.tsx:100`. The HTML shells are unversioned too, and
  `/onboarding/classic` reads `onboarding.html` from disk per request (`src/app/onboarding/classic/route.ts:120-132`).
  Cache-busting today = `must-revalidate` + ETag on every load. **Don't cache them in the SW**, or precache
  shells + helpers together under one revision (e.g. `VERCEL_GIT_COMMIT_SHA`) and drop the whole set on activate.
  They also pass through the proxy (`.js` is not in the matcher's skip list; `isFileRequest` exempts them from the
  restriction redirect, `src/proxy.ts:94-116`).
- **Fonts:** JetBrains Mono is self-hosted via next/font (immutable, safe). Fraunces/DM Sans come from Google (see (d)).
- **Icons:** `src/app/icon.png`, `src/app/apple-icon.png`, `src/app/icon.svg`, `public/favicon-48.png`, `public/favicon.ico`,
  `public/vibe-icon.svg`, referenced in `src/app/layout.tsx:14-24`. Same bytes for everyone, so stale-while-revalidate is fine.
- `/journal/**` (`public/journal/`) is an internal document marked noindex (`next.config.ts:76-83`). Never precache it.

---

## (f) Vercel deploys and version skew: how an installed app gets new code

**In plain English:** right now every page load asks Vercel for fresh HTML, so a phone picks up a new
deploy the next time it loads a page. If the old code and the new server disagree while you tap
around, Next.js notices and does a full reload. A service worker can break both. If it answers page
loads from its own copy, the phone keeps running the old version. The full reload then hits that same
copy, so the phone loops. Keep it simple: the service worker never stores pages, it doesn't need to
change when the app changes, and there's a ready "off switch" version of it to ship if anything goes wrong.

Facts:
- **A build id is exposed** in the RSC flight data inlined in every HTML page: `\"b\":\"R9PY-_zjWQm3L5ddLdQqr…\"`
  (seen in `/auth/login` HTML, 2026-09-24).
- **Skew handling built into Next 16.3.4:** the client compares the server's build id (or the
  `NEXT_NAV_DEPLOYMENT_ID_HEADER`) with its own. On a mismatch it does a full-page (MPA) navigation:
  `node_modules/next/dist/client/components/router-reducer/fetch-server-response.js:175-178`. Non-flight or non-200
  answers do the same (`:141-148`), and the segment cache treats a mismatch as a miss (`segment-cache/cache.js:2250-2256`).
- **Vercel Skew Protection looks off (UNVERIFIED against the project settings):** Next inserts
  `data-dpl-id` on `<html>` when it has a deployment id (`node_modules/next/dist/server/app-render/stream-ops.node.js:601-605`),
  and the client sends `x-deployment-id` from it (`fetch-server-response.js:466-470`). Prod `<html>` has no such
  attribute, and asset URLs carry no `?dpl=` (checked `/legal/terms`, `/auth/login`). Vercel's mechanism is
  documented at https://vercel.com/docs/skew-protection (no date shown). The immutable-asset path means old
  chunks stay fetchable anyway.
- **No app-level version signal:** no `VERCEL_GIT_COMMIT_SHA` / `VERCEL_DEPLOYMENT_ID` / build id is read anywhere
  in `src` (grep, empty); there's no `vercel.json`. Response headers carry `x-vercel-id` (a request id, not a deploy
  id). The Sentry SDK reads a `SENTRY_RELEASE` global (seen in `/_next/static/immutable/chunks/0nk_nmn19gugs.js`), but
  I couldn't find the injected value. **UNVERIFIED.**

What this means for the SW design:
1. **Never serve HTML or RSC from cache while online.** Otherwise: old cached shell → old chunks → build mismatch
   on the first client navigation → MPA reload → the SW hands back the same cached shell → stuck on the old build.
2. **Keep app deploys independent of the SW.** If the SW only caches `/_next/static/immutable/**` (content-addressed)
   and icons, a deploy needs no SW update. `sw.js` changes only when its own logic changes. A precache manifest that
   lists every build file (the Serwist default) changes `sw.js` on every deploy. Each update then sits in "waiting"
   until every Vibe window is closed ("the updated worker will wait until the existing worker is controlling zero
   clients"; `skipWaiting()` "means that your new service worker is likely controlling pages that were loaded with
   an older version", https://web.dev/articles/service-worker-lifecycle, updated 2016-09-29). Installed iOS apps
   are rarely fully closed.
3. **Serve `/sw.js` uncached and register with `updateViaCache: "none"`**, as the Next.js PWA guide shows (`Cache-Control:
   no-cache, no-store, must-revalidate` on `/sw.js`; https://nextjs.org/docs/app/guides/progressive-web-apps,
   lastUpdated 2026-07-30, docs version 16.3.6). Add it in `next.config.ts` `headers()` (`next.config.ts:37-86`).
4. **Keep a kill switch ready:** a `sw.js` that deletes all caches, calls `self.registration.unregister()`, and
   passes every fetch through. Deploy it at the same URL if a bad SW ships.
5. Optional: expose the commit (e.g. a `<meta name="vibe-build">` from `VERCEL_GIT_COMMIT_SHA`, or a `no-store`
   `/api/version`) so the page can show "New version, tap to reload" instead of relying on the MPA fallback.
6. The Next.js docs mention an experimental `useOffline` hook for connectivity-aware UI and retrying failed
   navigations (same PWA guide). That may cover "you're offline" without a caching SW. Not evaluated here.

---

## (g) Sentry and the service worker

**In plain English:** Sentry won't break. Its reports go straight to Sentry's own servers, and the
service worker ignores other websites. Two gaps to know about: errors *inside* the service worker won't
reach Sentry unless we add reporting there, and page-speed numbers will shift a little once a
service worker sits in front of pages.

- Init: `src/instrumentation-client.ts:1-7` → `getSentryInitOptions()` (`src/lib/sentry-config.ts:117-131`). DSN from
  `NEXT_PUBLIC_SENTRY_DSN`, `tracesSampleRate` 0.1 in prod, `sendDefaultPii: false`, `beforeSend` /
  `beforeSendTransaction` strip auth tokens from URLs, bodies and breadcrumbs (`:11-114`). Server side:
  `src/instrumentation.ts`. `withSentryConfig` has **no `tunnelRoute`** (`next.config.ts:88-93`), so the browser POSTs
  envelopes to the ingest host directly (cross-origin). No session-replay integration is configured.
- Interference: (1) a SW that ignores cross-origin and non-GET never touches Sentry traffic. If a `tunnelRoute` is
  added later it is a same-origin **POST**, still ignored. (2) SW runtime errors are invisible to the page SDK. Either
  `postMessage` them to a page that calls `Sentry.captureException`, or instrument the SW separately (SDK support in
  a SW global is **UNVERIFIED**). (3) If the SW ever rebuilds requests (`new Request(url)`), trace headers the SDK
  added are lost. Use `event.request` unchanged. (4) Navigation timings will include SW start-up after launch.
  Expect a step change in perf data, not a regression.
- Keep token-bearing URLs (`/auth/callback`, `/auth/confirm`, `/auth/update-password`) out of anything the SW logs
  or reports. The page scrubber (`sentry-config.ts:11-24`) doesn't run in the SW.

---

## (h) No CSP today: what a service worker and push would need if one arrives

**In plain English:** Vibe has no Content Security Policy yet, because the old desktop pages use inline
scripts (`next.config.ts:40-43`). When one arrives, it has to allow the service worker file, the
manifest, and every outside service in (d). The service worker also gets **its own** policy from the
headers on `sw.js`. If that policy is strict, it silently blocks the service worker's own requests to
other websites. That's one more reason for the service worker not to touch other websites at all.

- **The SW has its own CSP.** A worker is governed by the CSP on its script response, not the page's (CSP3 worker
  inheritance; **verify in testing**). The Next.js guide suggests `Content-Security-Policy: default-src 'self';
  script-src 'self'` on `/sw.js` (PWA guide above). With that policy, `respondWith(fetch(crossOriginRequest))`
  inside the SW would be blocked (`connect-src` falls back to `'self'`), which breaks fonts, R2 and Supabase images
  **only when the SW intercepts them**. Fix: don't call `respondWith` for cross-origin requests.
- **Page policy additions for the PWA:** `worker-src 'self'` (plus `blob:` if pdf.js builds its worker from a
  blob, **UNVERIFIED** for pdf.js 3.11 from cdnjs); `manifest-src 'self'`.
- **Page policy, for the origins in (d):** `connect-src 'self' https://<ref>.supabase.co https://<acct>.r2.cloudflarestorage.com https://*.ingest.us.sentry.io`;
  `img-src 'self' data: blob: https://<ref>.supabase.co https://<acct>.r2.cloudflarestorage.com`; `media-src` the same
  for video; `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `font-src 'self' https://fonts.gstatic.com`
  (both go away if fonts are self-hosted); `script-src 'self' 'nonce-…' https://cdnjs.cloudflare.com`.
  `frame-ancestors 'self'` would replace `X-Frame-Options: SAMEORIGIN` (`next.config.ts:47-56`).
  Stripe needs nothing: it's a top-level navigation, not a frame or script.
- **Push:** `pushManager.subscribe()` talks to the browser's push service internally, so no page `connect-src` entry
  is needed (**UNVERIFIED**, check in testing). The subscribe/unsubscribe calls to our own API are `'self'`.
- **Notification clicks:** `clients.openWindow(url)` should only open same-origin paths from an allow-list, never a
  raw URL from the push payload. Otherwise a tampered payload is an open redirect out of the installed app.

---

## NEVER CACHE (the service worker must not put these in Cache Storage)

For most of these the SW shouldn't even call `event.respondWith`. The default is "not my business".
1. **Every non-GET request** (POST/PUT/PATCH/DELETE): all writes, `/api/auth/logout`, `DELETE /api/me`, uploads.
2. **`/api/**`, all of it.** This includes the redirect-to-signed-URL routes `/api/posts/*/media`,
   `/api/me/threads/*/messages/*/media`, `/api/orgs/*/asset/*`, `/api/resume/**`; the `.ics` routes
   `/api/me/calendar/ics`, `/api/events/*/ics`; `/api/health/**`, `/api/billing/**`, `/api/admin/**`; and future
   `/api/me/push-*`.
3. **Every navigation** (`request.mode === "navigate"`, iframes included). Network only; on network failure, show
   the offline page and nothing else. This covers `/`, `/campus`, `/feed`, `/network`, `/messages`, `/otto`,
   `/the-map`, `/profile`, `/profile/*`, `/orgs/*`, `/posts/*`, `/settings`, `/plus` (incl.
   `?checkout=success&session_id=…`), `/admin`, `/account/suspended`, `/onboarding`, `/onboarding/classic`, `/legal/*`.
4. **`/auth/**`**, above all `/auth/callback?code=…`, `/auth/confirm?token_hash=…`, `/auth/update-password?token_hash=…`.
5. **RSC requests:** any request with an `RSC: 1` header or a `_rsc=` query (responses `Vary: rsc,
   next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`).
6. **`/html/*.html`** (proxy-gated, `src/proxy.ts:247-295`) and **`/html/*.js`** unless precached as one revisioned
   set (see (e)).
7. **`/sw.js`, `/manifest.webmanifest`**: the browser manages these.
8. **`/journal/**`**: internal.
9. **All cross-origin requests:** `https://<ref>.supabase.co/**` (auth, public and signed storage),
   `https://<acct>.r2.cloudflarestorage.com/**` (signed GET/PUT), `https://*.ingest.us.sentry.io/**`,
   `https://checkout.stripe.com/**`, `https://billing.stripe.com/**`, `https://cdnjs.cloudflare.com/**`,
   `https://fonts.googleapis.com/**`, `https://fonts.gstatic.com/**` (the last two only if kept third-party; the HTTP cache handles them).
10. **Second guard behind the URL allow-list:** never store a response that is `opaque`, `opaqueredirect`,
    `redirected`, non-200, or marked `private` / `no-store`.

## SAFE TO CACHE (same bytes for every visitor)

1. **`/_next/static/immutable/**`**: cache-first, long expiry (hashed, `public,max-age=31536000,immutable`,
   served across deploys). This includes next/font files under `/_next/static/immutable/media/`.
2. **Icons:** `/icon.png`, `/apple-icon.png`, `/icon.svg`, `/favicon.ico`, `/favicon-48.png`, `/vibe-icon.svg`,
   and any new manifest icons (e.g. `/icons/*`). Stale-while-revalidate.
3. **One purpose-built offline page** (e.g. `public/offline.html`: static, no user data, no private fetches),
   precached with a revision and shown only when a navigation fails.
4. Optional, not needed for v1: self-hosted font files if Fraunces/DM Sans move to next/font (they'd land in #1 anyway).

Housekeeping: name caches with a version (`vibe-static-v1`) and delete unknown names on `activate`. Page-side
`leaveDeviceClean()` deletes **all** Cache Storage entries. The SW never needs to know who is signed in, because
nothing it stores is personal.

---

## Sources (web; read 2026-09-24)

- Vercel, Cache-Control headers: https://vercel.com/docs/caching/cache-control-headers (last_updated 2026-09-14)
- Vercel, Skew Protection: https://vercel.com/docs/skew-protection (no date shown)
- Next.js, PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps (lastUpdated 2026-07-30, docs 16.3.6)
- Supabase, Creating a client for SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client (no date shown)
- MDN, Clear-Site-Data: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data (modified 2025-11-21)
- MDN BCD, Clear-Site-Data: https://raw.githubusercontent.com/mdn/browser-compat-data/main/http/headers/Clear-Site-Data.json (main branch, read 2026-09-24)
- WebKit, Web Push for Web Apps on iOS and iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (2023-02-16)
- firt.dev, Safari on iOS 14 for PWA developers: https://firt.dev/ios-14/ (2020-09-16; old, storage-sharing claim UNVERIFIED on current iOS)
- web.dev, The service worker lifecycle: https://web.dev/articles/service-worker-lifecycle (updated 2016-09-29)
