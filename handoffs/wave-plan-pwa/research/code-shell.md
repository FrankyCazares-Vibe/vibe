# Code shell map for the installable app (PWA)

Research pass, 2026-09-24. Read-only on the repo (`/Users/franciscocazares/vibe`, main @ 9c0e645).
Repo claims cite `path:line`. Anything I could not confirm in code or on a device is marked **UNVERIFIED**.
Apple's Home Screen rules (cookie jar, out-of-scope links, push) belong to the platform research file;
here they are stated only as the premise the task gave, and flagged where our code depends on them.

## TL;DR — plain English

- **Nothing PWA-shaped exists yet.** No manifest, no service worker, no `apple-mobile-web-app-*` tags, no
  code that asks "am I installed?" (grep for `display-mode`, `navigator.standalone`, `serviceWorker`,
  `PushManager`, `beforeinstallprompt`: zero hits in `src/` and `public/html/`).
- **Don't use "/" as the start page.** "/" is the starfield marketing page for everyone, signed in or not.
  A student who installs Vibe would land on the pitch every time and need two taps to get in.
  Use **`/campus`**: it is the first tab, and its gate chain already sends each student to the right step
  (log in, Terms, school email, onboarding) and back.
- **Scope has to be the whole site (`/`).** Every gate bounces through `/auth/*`; the desktop app hops
  through `/html/*.html`; the suspended notice is `/account/suspended`; legal is `/legal/*`.
- **Sign-in is email + password.** No magic-link sign-in, no Google/Apple sign-in. That is good news for
  an installed app: signing in never has to leave it. The three emails we send (confirm account, verify
  school email, reset password) are where the installed app and Safari can split apart.
  Two of the three already carry an **8-digit code** that works inside the installed app; the reset email
  is link-only.
- **The phone layout is decided by width alone (< 900 px), not by device type.** The phone screens already
  use `100dvh` and `env(safe-area-inset-*)`; I found no `100vh` that would break a standalone phone window.
- **One phone link will likely break in the installed app:** "Open file" on a résumé opens
  `/api/resume/...` in a new window, and that endpoint refuses anyone without a session cookie.
- **Icons are nearly ready.** 192, 180 and 48 px PNGs exist, fully opaque white, and the artwork sits well
  inside the "maskable" safe circle — so the same art can be exported at 512 px and as maskable with no
  redesign. A 512 px icon is the main missing piece.

---

## (a) Routing and gates — and what start_url / scope should be

### Plain English
There are two layers of gates. A fast one runs on every request (the "proxy") and only knows two things:
is this account suspended or banned, and is this one of the old static `.html` pages. The real
onboarding gates run inside each page on the server: are you signed in → did you accept the Terms → did
you verify a school email → did you finish onboarding. Each gate remembers where you were going (`next=`)
and brings you back.

### Proxy (`src/proxy.ts`) — every request except images
| # | Gate | What happens | Evidence |
|---|------|--------------|----------|
| P0 | Session refresh | `updateSession` calls GoTrue `getUser()` on every matched request and rewrites cookies | `src/proxy.ts:219`, `src/lib/supabase/middleware.ts:13-41` |
| P1 | Suspended / banned | Any page → 307 to `/account/suspended`; any non-GET API → 403 `account_restricted`. Still allowed: `/account/suspended`, `/legal/*`, `/auth/callback`, `/auth/confirm`, plus logout, `DELETE /api/me`, billing portal, block, mute | `src/proxy.ts:140-155`, `172-177`, `235-245` |
| P1a | Files pass P1 | `isFileRequest` exempts `.js .json .webmanifest .css .ico …` — already written with "`/manifest.json` and any service worker we add later" in mind | `src/proxy.ts:84-116` |
| P2 | Static `/html/*.html` | `profile.html?app=1&handle=<h>` is public; legacy `?user=`/`?handle=` without `app=1` → `/profile/<h>`; everything else: signed out → `/auth/login?next=<clean>`, signed in without `?app=1` → the clean route | `src/proxy.ts:35-50`, `247-295` |
| P3 | `/profile` signed out | → `/auth/login?next=/profile…` | `src/proxy.ts:297-303` |
| P4 | `/feed` | → `/campus` while the global feed flag is off | `src/proxy.ts:305-309` |
| P5 | Matcher | Skips only `_next/static`, `_next/image`, `favicon.ico` and image extensions | `src/proxy.ts:314-318` |

Other edge rules (`next.config.ts`): `/html/landing.html` → `/`, `/opportunities` → `/campus`, and the bare
apex `connectvibe.app/*` → **301 to `https://www.connectvibe.app/*`** (`next.config.ts:14-34`). The manifest,
`start_url` and service worker must all live on the **www** origin; an install from the apex would follow the
redirect. Security headers apply to every path, including a future `sw.js` (`next.config.ts:36-65`); there is
no CSP yet, so no `worker-src` work is needed.

**PWA consequence of P0/P5 (recommendation):** `/sw.js` and `/manifest.webmanifest` would match the proxy, so
every service-worker update check and manifest fetch would cost a GoTrue `getUser()` round-trip. Add them to
the matcher's negative lookahead (keep them public and cookie-free).

### Server page gates
| Route | Gate order | Evidence |
|-------|-----------|----------|
| `/campus`, `/feed`, `/messages`, `/network`, `/otto`, `/profile` | `enforceCampusAccess(path)`: signed out → `/auth/login?next=`; no consent → `/auth/terms?next=`; not school-verified → `/auth/school-email?next=`; onboarding not done → `/onboarding?next=` | `src/lib/auth/campus-access.ts:19-49`; callers `src/app/campus/page.tsx:15`, `src/app/messages/page.tsx:25`, `src/app/profile/page.tsx:22-30`, `src/app/network/page.tsx:11`, `src/app/otto/page.tsx:24`, `src/app/feed/page.tsx:17` |
| `/onboarding` | login → Terms → school email → already done → `/profile` | `src/app/onboarding/page.tsx` (server page, gate block after the service read) |
| `/auth/school-email` | login → Terms → already verified → `/onboarding` or `/profile` | `src/lib/auth/campus-access.ts:57-84` |
| `/settings` | login only; **no consent gate on purpose** (declining Terms must still reach delete) | `src/app/settings/page.tsx:21-23`, `60-62` |
| `/posts/[id]`, `/the-map` | login only | `src/app/posts/[id]/page.tsx:128-130`, `src/app/the-map/page.tsx:28-29` |
| `/admin` | signed out → login; non-admin → `notFound()` | `src/app/admin/page.tsx:25-38` |
| `/account/suspended` | signed out → `/auth/login`; not restricted → `/campus` | `src/app/account/suspended/page.tsx:223-227` |

After a password sign-in with no `next`: school email → onboarding → **`/profile`**
(`src/lib/auth/post-login.ts:22-56`, `DEFAULT_POST_LOGIN_PATH` at `src/lib/auth/email-confirm-redirect.ts:20`).
Finishing onboarding lands on **`/campus?welcome=1`** (`src/components/mobile/OnboardingMobile.tsx:652`,
`public/html/onboarding.html:3667`).

### Cold launch of "/"
- `src/app/page.tsx:1-7` renders `<HomeLanding />` with `force-dynamic`; the component has **no session check**
  (`src/components/landing/home-landing.tsx:14-16` hard-codes Log in / Sign up hrefs; `72-95` is the warp
  animation). Signed-in and signed-out students get the same starfield page.
- Tapping Log in while signed in shows a **Continue button, never an auto-redirect** (deliberate, to avoid a
  sign-out loop): `src/app/auth/login/page.tsx:93-110`, `166-184`.

### Recommendation for the manifest
- **`start_url: "/campus"`** — Campus is the first phone tab (`src/components/mobile/MobileTabBar.tsx:37-40`)
  and where onboarding ends. Signed out → login with `next=/campus`; half-onboarded → the right step;
  suspended → the notice (proxy P1). No new code needed for any of those.
- **`scope: "/"`** — anything narrower puts `/auth/*`, `/html/*`, `/legal/*` and `/account/*` out of scope,
  and every gate hop would show browser chrome (or leave the app).
- **Set `id` explicitly** (e.g. `"/"`) so a later `start_url` change doesn't make browsers treat it as a
  different app. (Decision, not a code fact.)
- **Don't rely on a `?source=pwa` marker in start_url**: `enforceCampusAccess("/campus")` passes a bare
  `/campus` as `next`, so the query is dropped the first time a gate fires (`src/app/campus/page.tsx:15`).
  Detect "installed" in the client with `matchMedia('(display-mode: standalone)')` / `navigator.standalone`.
- `/campus` alone is **not** a good alternative on the signed-out side if we want installers to see sign-up
  first: it lands on `/auth/login` (which links to sign-up). Acceptable, since coaching happens after sign-up.

---

## (b) The static pages under `public/html`

### Plain English
The desktop app is partly three big hand-written HTML pages (profile 11,119 lines, onboarding 4,030,
messages 3,607). Phones never load them — each route checks the screen width first and phones get React
screens instead. On desktop they are either loaded directly (profile) or shown inside a frame (messages,
onboarding). For an installed phone app this means the static pages mostly don't matter. For an installed
desktop app (Chrome/Edge "Install") they all sit inside scope `/` and keep working.

### How each one is served
| Page | Desktop path | Phone path | Evidence |
|------|--------------|-----------|----------|
| `profile.html` (own) | `/profile` → `ProfileHtmlBridge` fetches `/api/me/profile-bootstrap`, then `location.replace('/html/profile.html?app=1&…')`; the page then `history.replaceState`s the bar back to `/profile` | `MobileShell` + `ProfileMobile`; bridge bails at `max-width: 899px` | `src/app/profile/ProfileSwitch.tsx:25-35`, `src/app/profile/profile-html-bridge.tsx` (effect: mobile bail, bootstrap, `staticProfileHref`), `public/html/profile.html:11100-11116` |
| `profile.html` (someone else) | `/profile/<h>` → `ProfileHandleSwitch` hops to `?app=1&handle=<h>` (public, signed-out OK) | `ProfileMobile` in visitor mode | `src/app/profile/[handle]/ProfileHandleSwitch.tsx:15-60`, `src/proxy.ts:262-266` |
| `messages.html` | `/messages` → `CampusAppShell` + `<iframe src="/html/messages.html?app=1&embedded=1[&to|&channel]">`, height `100vh` | `MessagesMobile` | `src/app/messages/MessagesSwitch.tsx:26-58` |
| `onboarding.html` | `/onboarding` → full-screen `<iframe src="/onboarding/classic">`; that route reads the file, injects `<script id="onbBoot">`, `Cache-Control: no-store` | `OnboardingMobile`; layout decided **once** per tab | `src/app/onboarding/OnboardingSwitch.tsx` (readLayout + iframe), `src/app/onboarding/classic/route.ts:126-131` |

Flags the static pages read:
- `?app=1` — "this is the signed-in desktop app, not a legacy link" (`src/proxy.ts:49-50`, `290`).
- `?embedded=1` — adds `body.vibe-embedded`, which hides the page's own left nav because the React shell
  supplies one (`public/html/_persistence.js:31-43`, `public/html/messages.html:24-25`). The proxy carries it
  across legacy redirects (`src/proxy.ts:276`).
- Framing is allowed only by our own origin: `X-Frame-Options: SAMEORIGIN` (`next.config.ts:49-57`).

### Navigation out of a frame
- Helpers `window.__vibeTopNav(url)` / `__vibeTopReplaceState` navigate the **top** window when inside a frame
  (`public/html/_persistence.js:50-86`). Used 10× in `messages.html`, 5× in `_postViewer.js`, 3× in `profile.html`.
- `public/html/_otto.js:833-865` (notification clicks) uses plain `window.location.href = …`. `messages.html`
  loads `_otto.js` (`public/html/messages.html:15`), so a notification clicked inside the desktop messages frame
  would navigate the frame, not the window. **UNVERIFIED** whether the Otto corner renders inside that frame at
  all; pre-existing desktop quirk, not a PWA blocker.

### Links that open a new window or leave the app
Premise from the task: an iOS Home Screen app does not share cookies/storage with Safari. **UNVERIFIED on a
device** where `target=_blank` / `window.open` lands in standalone mode (Safari vs an in-app sheet); either
way it is outside the app's cookie jar under that premise.

| Where | What | Phone? | PWA risk |
|-------|------|--------|----------|
| `src/components/mobile/ResumeViewerMobile.tsx:489-491`, `534-536` | `<a target="_blank">` to `/api/resume/<uid>/…` ("Open file", "blacked-out copy") | **Yes** | **High.** `/api/resume` returns 401 JSON with no session (`src/app/api/resume/[...path]/route.ts:129-131`). Open in-app (same window / viewer) when standalone. |
| `public/html/profile.html:5379-5394` | `window.open('', '_blank')` then set URL to the resume "as others see it" | Desktop only | Low (desktop PWA windows share the browser profile's cookies). |
| `src/app/auth/signup/page.tsx:427-440`, `src/app/auth/terms/accept-terms-form.tsx:113-122` | Terms / Privacy `target=_blank` | Yes | Low — public pages, but it takes the student out of sign-up mid-form. |
| `src/app/orgs/[handle]/page.tsx:1070`, `src/app/campus/campus-home.tsx:10534` | club external links `target=_blank` | orgs page yes | Fine — external by design. |
| `src/app/legal/child-safety/page.tsx:155` | CyberTipline external | Yes | Fine. |
| `src/components/LeftNav.tsx:1279-1284` | `window.open` Google Calendar | Desktop | Fine. |
| `src/app/account/suspended/page.tsx:194`, `355`; legal pages | `mailto:` | Yes | Fine — hands off to Mail. |
| `src/lib/feedback/request.ts:234-268` (`downloadFile`, blob + `<a download>`) | calendar `.ics` | Desktop (`LeftNav.tsx:1291`); `campus-home.tsx:8740` desktop | **UNVERIFIED** in iOS standalone; not on a phone surface today. |
| `src/app/plus/PlusActions.tsx:150-160` | `window.location.assign(<Stripe URL>)` — top-level nav to another origin | Yes | See (d): Stripe return. |

---

## (c) Phone vs desktop, safe areas, viewport height

### Plain English
The app picks the phone layout purely by window width: under 900 px wide is "phone". It never looks at
the device type. So an installed app on an iPhone always gets the phone screens, and an iPad in landscape
(wider than 900 px) gets the desktop screens, frames and static pages included. The phone screens already
pad for the notch and the home bar, and already use the "dynamic" viewport unit that behaves in a
standalone window. The pages that are *not* phone-specific (auth, Vibe+, club pages, legal) don't pad for
the notch at the top — that only matters if we choose the status-bar style that lets content run under it.

### How the phone layout is chosen
- `MOBILE_BREAKPOINT_PX = 900`; hook matches `(max-width: 899px)` (`src/lib/use-is-mobile.ts:14-16`, `31-55`).
  The server always renders the desktop tree and swaps after hydration (one-frame flicker, by design,
  `src/lib/use-is-mobile.ts:40-53`). The comment expects "mobile users will mostly arrive via Capacitor" —
  that plan is now the PWA.
- No user-agent sniffing anywhere in routing (only `src/components/ui/wavy-background.tsx:107-108`, a
  Safari canvas quirk).
- Onboarding decides once per tab and never swaps (`src/app/onboarding/OnboardingSwitch.tsx`, `readLayout`).
- Phone-forked routes (via `MobileShell`): `/campus`, `/messages`, `/profile`, `/profile/<h>`, `/network`,
  `/otto`, plus `OnboardingMobile` (`src/app/campus/CampusSwitch.tsx:17-31`,
  `src/app/messages/MessagesSwitch.tsx:26-37`, `src/app/profile/ProfileSwitch.tsx:25-35`).
- `/settings` still uses the legacy `CampusAppShell`, which also mounts `MobileTabBar`
  (`src/components/campus-app-shell.tsx:33-49`).
- **No shell / no tab bar on phone:** `/plus`, `/orgs/<h>`, `/posts/<id>`, `/auth/*`, `/legal/*`,
  `/account/suspended`, `/the-map`, `/admin`. In a standalone window there is no browser Back button, so
  every one of these needs its own way back (most have a back link; **UNVERIFIED** for each — the browser
  pass should check this at 375 px in standalone).

### Bottom nav
- Five tabs: Campus, Network, otto, Messages, Profile (`src/components/mobile/MobileTabBar.tsx:37-116`).
- CSS: fixed bottom, `padding-bottom: env(safe-area-inset-bottom)`, hidden ≥ 900 px and while a composer is
  open (`src/app/globals.css:2677-2702`).
- `MobileShell` reserves `calc(64px + env(safe-area-inset-bottom))` and uses `minHeight: 100dvh`
  (`src/components/mobile/MobileShell.tsx:25-39`).

### Safe areas
- `viewportFit: "cover"` is already set (`src/app/layout.tsx:27-32`), so `env(safe-area-inset-*)` is live.
- Top inset handled: campus banner (`src/app/globals.css:2618-2626`), `.vibe-mobile-safe-top` utility
  (`2820-2826`), settings/network padding (`2828-2836`), Otto room (`2551`), phone messages frame
  (`2843-2852`), `CampusMobile.tsx:579`, `641-642`, `2181`, plus ProfileMobile (6 uses), MessagesMobile (4),
  NetworkMobile, OttoMobile, PostComposerMobile, PostViewerMobile, ResumeViewerMobile, `onboarding/OnbHeader.tsx`.
- **Top inset NOT handled** (content would sit under the status bar if we pick `black-translucent`):
  `src/app/auth/layout.tsx:1-14` (padding 24px) + `.vibe-auth-page` (`src/app/globals.css:1065-1072`),
  `src/app/plus/page.tsx:460`, `src/app/orgs/[handle]/page.tsx:336`, `src/components/legal/LegalLayout.tsx:30`,
  `src/app/the-map/page.tsx:39`, `src/app/account/suspended/page.tsx`.
- No `appleWebApp` metadata / `apple-mobile-web-app-status-bar-style` today (grep: none). Which style
  puts content under the status bar is a platform fact — **UNVERIFIED here**, see the platform file.

### 100vh
- Almost every `100vh` is `min-height` (landing, auth, otto room, app shell: `src/app/globals.css:369`, `398`,
  `472`, `1067`, `1786`, `2601`) — harmless in standalone.
- Fixed `height: 100vh` is on desktop-only frames: `MessagesSwitch.tsx:51`, `OnboardingSwitch.tsx` iframe,
  `LeftNav.tsx:242`.
- Phone code already prefers `dvh`: `PostComposerMobile.tsx:349-358` (100vh only as fallback, keyboard-aware),
  `campus-home.tsx:748-752`, `globals.css:2841-2852`.
- **Verdict: no `100vh` blocker found for a standalone phone window.**

---

## (d) Auth — how students sign in, and every flow that leaves the app

### Plain English
Students sign in with **email + password**, typed into the app. There is no "email me a sign-in link" and
no Google/Apple button. Email is used three times, and each one is a place where the installed app and
Safari can end up in different states, because (per the task's premise) the installed app keeps its own
cookies:

1. **Confirm your account** (after sign-up) — email has a button *and* an 8-digit code. The code works
   inside the installed app. The button opens Safari and signs Safari in, not the app.
2. **Verify your school email** — email leads with an 8-digit code (works in the app); the button only works
   "while you're signed in to Vibe on this device", which in Safari means signing in again there.
3. **Reset your password** — link only, no code. It opens Safari; the student picks a new password there,
   then has to sign in again inside the installed app. Works, just clunky.

### Sign-in
- `supabase.auth.signInWithPassword` (`src/app/auth/login/page.tsx:136-141`), then a full navigation
  (`window.location.assign`, `:164`) so the proxy sees the new cookies. Sessions are `@supabase/ssr` cookies
  refreshed on each request (`src/lib/supabase/middleware.ts:13-41`).
- No `signInWithOtp`, `signInWithOAuth`, or magic-link calls anywhere (grep of `src/` + `public/html/`).
  `supabase/config.toml` has `[auth.external.apple]` with `enabled = false` (`:329-330`), not wired to any UI.
  (That file configures the local stack; the production dashboard settings are **UNVERIFIED** here.)

### The three emails, precisely
| Email | Link target | Code? | Signs in which browser | Evidence |
|-------|------------|-------|------------------------|----------|
| Confirm account (Supabase template) | `{{ .SiteURL }}/auth/confirm?token_hash=…&type=email` — tap-to-confirm, no auth call until tapped (defeats mail scanners) | **Yes**, `{{ .Token }}`, 8 digits | Whichever opened the link (`verifyOtp({token_hash})`); the code form signs in the browser it's typed into (`verifyOtp({email, token})`) | `supabase/templates/confirmation.html:50`, `58`, `65`; `supabase/config.toml:230`; `src/app/auth/confirm/page.tsx:40-72`, `120-135`; `src/components/auth/ConfirmCodeForm.tsx:38-45` |
| Verify school email (Resend) | `/auth/verify-school?token=…` (48 h), needs a signed-in session in that browser | **Yes**, 8 digits, 30 min, shown first | Code: the app it's typed into. Link: signed-out browser → "Sign in here to finish" → `/auth/login?next=<this link>` | `src/lib/email/resend-transactional.ts:187-235`; `src/app/auth/verify-school/page.tsx:15-60`, `69-75`, `213`, `281`; code box `src/app/auth/school-email/page.tsx:539-553` |
| Reset password (Resend) | `/auth/update-password?token_hash=…&type=recovery` (our page, spends the token only on submit) | **No** | The browser that opened the link | `src/app/api/auth/password-reset/route.ts:14-27`, `95`; `src/lib/email/resend-transactional.ts:142-175`; `src/app/auth/update-password/page.tsx:255-262`, `380` |

Legacy: `/auth/callback` still handles old `?code=` (PKCE) and `#access_token` confirmation links; `signUp`
still passes `emailRedirectTo: /auth/callback?next=/auth/school-email?account_verified=1`, used by resends
(`src/app/auth/callback/page.tsx:133-151`; `src/app/auth/signup/page.tsx:178-190`;
`src/lib/auth/email-confirm-redirect.ts:8`, `22-27`; `src/components/auth/ResendConfirmation.tsx:115-119`).

### What happens today if the student installed Vibe and taps an email link
(Assuming the task premise: Home Screen app and Safari don't share cookies or `localStorage`.)
- **Sign-up confirm link.** Safari opens `/auth/confirm`, confirms the account and signs *Safari* in. The
  "this browser signed up" check reads `localStorage`, which is the app's, so Safari shows the
  "signed in by link / Not you?" card instead of continuing (`src/app/auth/confirm/page.tsx:200-215`
  region: `isSameEmail(email, readPendingSignupEmail())` → `signed_in_by_link`). Back in the app, the
  "Check your email" view does not poll; the student must tap "Sign in" (`/auth/login?notice=confirmed`,
  `src/app/auth/signup/page.tsx:313`) and type the password again. **Typing the code avoids all of this**
  (`src/app/auth/signup/page.tsx:274-292`).
- **School-email link.** Safari is signed out → asked to sign in there → verifies → the app's
  `/auth/school-email` page does not notice until the next navigation (no refresh on focus; the page only
  listens to `pageshow` for back-forward cache, `src/app/auth/school-email/page.tsx:277-278`). The code path
  works in-app today.
- **Reset link.** New password set in Safari (Safari signed in); the app is still signed out and needs the new
  password. The email says "Any browser or phone is fine" (`resend-transactional.ts:160`) — true, but the app
  won't follow along.

### Every flow that leaves the app and must come back
| Flow | Leaves to | Comes back to | Evidence | PWA note |
|------|-----------|---------------|----------|----------|
| Password sign-in | — (stays) | `next` or post-login chain | `login/page.tsx:136-184` | Clean. |
| Sign-up confirm | Mail → link | `/auth/confirm` → `/auth/school-email?account_verified=1` | above | Code works in-app; link splits browsers. |
| School email | Mail → link | `/auth/verify-school` → `next` or `/onboarding` | above | Code works in-app. |
| Password reset | Mail → link | `/auth/update-password` | above | Link-only; add a code later or coach "come back and sign in". |
| Stripe Checkout | `window.location.assign(checkout.stripe.com…)` | `success_url` `/plus?checkout=success&session_id={CHECKOUT_SESSION_ID}`, `cancel_url` `/plus?checkout=canceled` | `src/app/plus/PlusActions.tsx:150-160`; `src/app/api/billing/checkout/route.ts:144-146`, `169-170` | Out-of-scope top-level nav in standalone: **UNVERIFIED** whether iOS keeps it in the app's web view (cookies intact) or opens a separate sheet. Test on device before prod billing is switched on. |
| Stripe Customer Portal | same | `return_url` `/plus` | `src/app/api/billing/portal/route.ts:94` | same |
| Origin of those return URLs | — | `getSiteOriginForRequest` → `NEXT_PUBLIC_SITE_URL` in prod | `src/lib/auth/site-url.ts:19-44` | Must be `https://www.connectvibe.app` so the return is in scope. **UNVERIFIED** env value. |
| Club invites | **none by email** — in-app notifications only | `/orgs/<h>` | `src/app/api/orgs/[slug]/invites/route.ts:27-40`; the only Resend sends are `resend-transactional.ts:142`, `187` and founder alerts `src/lib/moderation/alerts.ts:157-169` (`/admin?tab=reports`) | Nothing to fix. |
| Notification taps (future push) | — | `/orgs/<h>` or `/campus?tab=orgs`; `/posts/<id>`; desktop Otto: `/messages`, `/profile?post=<id>`, `/profile/<h>` | `src/components/otto/OttoActivity.tsx:76-82`; `public/html/_otto.js:833-865` | All in scope; all gated with `next=`. For chat mentions prefer `/messages?channel=<id>` (supported, `src/app/messages/page.tsx:17-35`) over bare `/messages`. |
| Shared profile links `/profile/<h>` | iMessage/Instagram etc. | Safari, not the app | `src/proxy.ts:262-283` | Web apps don't capture links on iOS (**UNVERIFIED**, platform file). |
| Terms/Privacy during sign-up | `target=_blank` | — | see (b) | Low. |

### Sign-out paths (a push subscription must be dropped on each)
`src/components/settings/SettingsClient.tsx:1175-1190` (Settings → Sign out, hard-navigates to `/auth/login`),
`src/app/auth/terms/accept-terms-form.tsx:66` (decline Terms), `src/app/account/suspended/suspended-actions.tsx:54`,
`src/components/auth/EmailLinkProblem.tsx:69-75` ("Not you? Sign out", client `signOut`),
account deletion `DELETE /api/me` (`SettingsClient.tsx:1246`). The server route is `POST /api/auth/logout`.
Shared phones in a dorm make this matter: a push meant for the old account must not reach the next one.

---

## (e) Existing icons and brand colours

### Plain English
We have the logo at 192, 180 and 48 pixels, each on a solid white square with no transparency. The logo
(orange ring, black "V", orange dot) only fills the middle two-thirds of the square, which is exactly what
Android's "maskable" icons need, so we can reuse it as-is. We are missing a 512-pixel version, which
Chrome requires before it will offer "Install". The original vector file exists, so any size can be made.

### Measured (sips + a pixel scan of each PNG)
| File | Pixels | Alpha | Background | Artwork reaches (from centre, as share of half-width) | Maskable-safe? |
|------|--------|-------|-----------|------|------|
| `src/app/icon.png` | 192 × 192 | channel present, every pixel 255 (opaque) | `#FFFFFF` full bleed | 0.675 (bbox 36,33 → 155,152) | **Yes** (limit 0.80) |
| `src/app/apple-icon.png` | 180 × 180 | opaque | `#FFFFFF` | 0.677 | Yes |
| `public/favicon-48.png` | 48 × 48 | opaque | `#FFFFFF` | 0.665 | Yes (too small to use) |
| `public/favicon.ico` | 16 + 32 (+2 more) | — | — | — | n/a |

"Maskable-safe" here = all non-white pixels fall inside the circle of radius 40 % of the icon size centred on
the icon (the W3C maskable safe zone; platform file should cite the spec). Cross-check on the vector:
`src/app/icon.svg` (= `public/vibe-icon.svg`, identical 1254×1254 viewBox) — ring arc centre ≈ (625, 610),
r 383.5, stroke 15; outermost ink ≈ 425 px from centre vs a safe radius of 501.6 px (ratio 0.68).

### Colours in play
- Icon: background `#FFFFFF`, ring + dot `#FC6B2F`, "V" `#1A1A1A` (`src/app/icon.svg:2-5`). Note the ring is
  `#FC6B2F`, a hair off the app accent `#FF5C35`.
- App tokens: cream `#FAF7F2`, charcoal `#1C1C1E`, accent `#FF5C35` (`src/app/globals.css:9-12`).
- `themeColor` today: `#FAF7F2` (`src/app/layout.tsx:31`). Phone shell background `#FAF7F2`
  (`MobileShell.tsx:33`). Onboarding background `#1C1C1E` (`OnboardingSwitch.tsx` boot shell + iframe).
  Landing background is dark (`#07060f` + gradient, `src/app/globals.css:367-375`).
- Suggestion: manifest `background_color: "#FAF7F2"` and `theme_color: "#FAF7F2"` — the splash then matches
  the first screen a signed-in student sees (`/campus`).

### What exists vs what's missing
- Next.js file-convention icons emit `<link>` tags automatically, and `layout.tsx:11-25` also lists them
  explicitly (`/icon.png` 192, `/favicon-48.png`, `/favicon.ico`, `/vibe-icon.svg`, apple `/apple-icon.png`).
- Missing: **512 × 512** (`any`), **maskable 192 + 512** (same art, can reuse), optionally a monochrome
  badge icon for Android notifications. iOS startup images are optional (**UNVERIFIED** whether still needed).

---

## (f) Where an "Install Vibe" coach and a notification opt-in could live

### Plain English
Four natural spots: (1) a card in Settings that is always there, (2) a dismissible banner on the phone
Campus page, in the slot the "confirm your campus" banner already uses, (3) right after the welcome tour
that runs when onboarding finishes, and (4) the Otto tab, because that is where notifications show up on a
phone today. Rule of thumb: in Safari, coach "Add to Home Screen"; once installed, ask for notifications —
and only after a tap.

| Surface | Path | Why it fits | Notes |
|---------|------|------------|-------|
| Settings card ("Get the app" + "Notifications") | `src/components/settings/SettingsClient.tsx:115-126` (card order: Account, Campus, Handle, Campus tour, Blocked, Help & safety, Sign out, Danger zone) | Always reachable; phone reaches it from the Profile gear (`src/components/mobile/ProfileMobile.tsx:1580`) and desktop from `LeftNav.tsx:138` | Put it after "Campus tour" (`CampusTourCard` at `:131`); same `SectionTitle`/`Row` primitives (`:1572-1600`). Mirror for desktop install (Chrome `beforeinstallprompt`). |
| Campus banner slot (phone) | `src/components/mobile/CampusMobile.tsx:631` mounts `CampusConfirmBanner` above the tab strip | Proven dismissible-nudge pattern: fetches state, "Not now" in `sessionStorage`, renders nothing on failure (`src/components/mobile/CampusConfirmBanner.tsx:25-60`) | Show one banner at a time (campus-confirm wins). Install nudge wants a longer "not now" (localStorage + days) than the session-only one. |
| After the welcome tour | Onboarding → `/campus?welcome=1` (`OnboardingMobile.tsx:652`); campus tour ends with "Got it" → `handleDone(leg, "done")` (`src/components/mobile/use-mobile-tour.ts:331-332`, `362`) | Highest-intent moment; the student just finished setting up | Don't stack on top of the tour; fire after `onDone`. Desktop equivalent: `campus-home.tsx` tour. |
| Otto tab (phone) | `src/components/mobile/OttoMobile.tsx:375` renders `OttoActivity` ("Otto saw"), the phone's notification list | "Get these on your lock screen" next to the thing it controls | Good home for the notification opt-in once installed. |
| Messages (phone) | `src/components/mobile/MessagesMobile.tsx` | After a first DM is sent/received: "Know when they reply" | Scoped opt-in with a reason, after a user gesture. |
| Auth "check your email" views | `src/app/auth/signup/page.tsx:274-292`; `src/app/auth/school-email/page.tsx:539-553` | Not a coach — but when running installed, lead with "type the code" and demote the link | Needs the standalone check. |

There is no unread badge on the phone tab bar today (`MobileTabBar.tsx` has no count), so an app-icon badge
would be new ground, not a port.

---

## Risks and open questions (for the wave plan)
1. **Résumé "Open file" on phone** will likely hit a 401 in the installed app (see (b)). Fix before launch.
2. **Email links split the app from Safari.** Sign-up and school email have codes; password reset does not.
   Decide: add a code to the reset email, or coach "come back and sign in".
3. **Stripe from standalone** — device-test Checkout and Portal return before prod billing turns on.
4. **Proxy cost on SW/manifest** — exclude `/sw.js` and `/manifest.webmanifest` from the matcher.
5. **Service worker must not cache HTML navigations or `/api/*`**: every page is per-student and gated
   (`force-dynamic` on `/`, `no-store` on `/onboarding/classic`, suspended redirects in the proxy). A cached
   page could show one student's shell to the next on a shared phone, or skip the suspension gate.
6. **Pages with no tab bar and no browser Back** in standalone (`/plus`, `/orgs/<h>`, `/posts/<id>`, `/legal/*`,
   `/the-map`) — the 375 px browser pass should confirm each has a visible way back.
7. **Status-bar style** — if `black-translucent`, the auth, Vibe+, club, legal and map pages need top padding.
8. **iPad landscape** gets the desktop tree (static pages + frames) inside the installed app — test once.
9. **Apex vs www** — install only from `www.connectvibe.app`; the apex 301s (`next.config.ts:28-33`).
