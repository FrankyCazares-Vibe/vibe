# The installable app (PWA) — plan and contract

**Session 65 · 2026-09-24.** Research: `research/*.md` (7 maps, 3 fact-checks, `critic.md`). Where they
disagree, **this file wins**, then `critic.md`, then a `*.factcheck.md` CORRECTED line, then the research file.

Waves follow `critic.md` §"Waves" (4 waves, 4–5 batches each, disjoint file ownership per wave). This file pins
the rulings and contracts every batch codes against. Waves 2–4 get their own section here before they start.

---

## §1 — Orchestrator rulings (settle the research contradictions)

| # | Ruling |
|---|---|
| R1 | Manifest: `id: "/"`, `start_url: "/campus"`, `scope: "/"`, `display: "standalone"`, `name: "Vibe"`, `short_name: "Vibe"`, `description` = the layout's ("Your campus, your career, one profile."), `background_color` and `theme_color` `#FAF7F2`, `orientation` omitted, `launch_handler: { client_mode: ["navigate-existing", "auto"] }`. No `?source=` on start_url (the first gate drops it). |
| R2 | Icons are rendered from `src/app/icon.svg` with sharp (a dependency already). The artwork already sits inside the maskable safe zone (≤0.68 of the half-width), on a full-bleed `#FFFFFF` square: `any` 192 + 512, `maskable` 192 + 512 (same art, same white), and a monochrome notification badge (white V + ring on transparent, 96px) for wave 2. `src/app/apple-icon.png` stays as is. Manifest `icons` lists `any` and `maskable` as SEPARATE entries (never `"any maskable"`). |
| R3 | iOS: `appleWebApp: { capable: true, title: "Vibe", statusBarStyle: "default" }`. No splash images (`apple-touch-startup-image`) in v1. |
| R4 | Service worker = hand-written `public/sw.js`, fixed URL forever, a `SW_VERSION` constant bumped on every edit. It precaches ONE file, `/offline.html`. Its fetch handler touches ONLY same-origin `GET` requests with `mode === "navigate"`: `respondWith(preloadResponse ?? fetch(request))`, and on a network failure the cached offline page. Every other request gets no `respondWith` at all (no /api, no assets, no cross-origin). Nothing per-student is ever stored. |
| R5 | Update lifecycle: `install` → `skipWaiting()`; `activate` → enable navigation preload, delete every cache not named for this `SW_VERSION`, `clients.claim()`. Safe because nothing but the offline page is cached. The "new version, tap to refresh" toast for the APP is wave 4 (`/api/version`). |
| R6 | Precache fetches `/offline.html` with `{ cache: "reload", redirect: "error" }` and stores it only if `res.ok && !res.redirected && res.type === "basic"`. A failed precache must not fail the install (the handler then falls back to a plain `Response` with inline text). |
| R7 | Kill switch: `scripts/pwa/sw-killswitch.js` is a complete sw.js replacement — no fetch handler; on install `skipWaiting`; on activate delete all caches, `registration.unregister()`, then `clients.matchAll({type:"window"})` → `client.navigate(client.url)`. Drill: copy it over `public/sw.js`, deploy. The browser's update check bypasses the SW, so even a broken worker is replaced on the next navigation. |
| R8 | Registration gate (no env var needed in production): register only when `"serviceWorker" in navigator` AND (`location.hostname === "www.connectvibe.app"` OR `process.env.NEXT_PUBLIC_SW_DEV === "1"`). Local testing runs `next dev` against the LOCAL Supabase copy with `NEXT_PUBLIC_SW_DEV=1`. **Never `next start` on this Mac.** A `NEXT_PUBLIC_SW_KILL === "1"` build flag makes the registrar unregister every registration and delete every cache instead of registering. |
| R9 | Register options everywhere (React registrar AND `public/html/_sw.js`): exactly `navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })`. Different options would re-register. Register after `load` (or idle), never blocking render. Call `registration.update()` when the page becomes visible and the last check was over an hour ago. |
| R10 | `beforeinstallprompt`: wave 1 CAPTURES it at module load (stash + subscribe API) but does **not** call `preventDefault()` — Chrome keeps its own install UI until wave 3's coach exists. Also listen for `appinstalled`. |
| R11 | Proxy: add `sw\\.js`, `offline\\.html` and `manifest\\.webmanifest` to the matcher's negative lookahead (src/proxy.ts:316) so none of them runs a GoTrue `getUser`, gets redirected to the suspension notice, or gets a session cookie. |
| R12 | Headers (next.config.ts): `/sw.js` → `Cache-Control: no-cache, no-store, must-revalidate` + `Content-Type: application/javascript; charset=utf-8`. `/offline.html` → `Cache-Control: no-cache`. **No CSP on sw.js in v1** (a CSP on the worker script governs the worker's own fetches). Keep `X-Frame-Options: SAMEORIGIN` (the Next guide's DENY would break Vibe's own frames). |
| R13 | Push payload contract (sw.js parses it in wave 1; wave 2's server builds it): `{"web_push":8030,"notification":{"title","body","navigate","tag","app_badge"},"app_badge":N,"mutable":false}`. `navigate` is an ABSOLUTE `https://www.connectvibe.app/...` URL. `app_badge` goes in BOTH places (iOS 18.4–18.x read it inside, 26+ at the top level); the SW reads the top level first and accepts a number or a numeric string. No `Content-Type: application/notification+json`. Every push shows a notification — if parsing fails the SW still shows `"Vibe"` / `"You have new activity"` (silent pushes get the permission revoked). |
| R14 | `notificationclick`: close; take `data.url` (or `notification.navigate`); accept it only if `new URL(u, self.location.origin).origin === self.location.origin`, else `/campus`; focus an existing window client and `navigate()` it, else `openWindow()`. The SW also passes `navigate` in `showNotification` options. |
| R15 | `message` event `{type: "SIGNED_OUT"}` → delete every cache except the current offline cache. Wave 3 sends it from `leaveDeviceClean`. |
| R16 | Sign-in does not change (decision D5 = a, pending Franky): in standalone the confirm-account and school-email screens LEAD with the 8-digit code and say email links open Safari; the reset email gets one line for Home Screen users. The phone résumé viewer HIDES "Open file" in standalone (a new window is Safari's cookie jar → 401; navigating the app away strands the student with no back button). Legal pages' Back goes to `/campus` in standalone. |
| R17 | Standalone-only cream: `@media (display-mode: standalone), (display-mode: fullscreen) { html, body { background-color: #FAF7F2 } }` placed AFTER the `@apply bg-background` rule so it wins. (iOS reports an installed `display: standalone` app as `fullscreen` — WebKit bug 264218 — so every standalone check matches both, plus `navigator.standalone`.) |
| R18 | Offline for launch = the branded offline page only (D4 = a). |

---

## §2 — Wave 1: the installable shell (no push sending, no migration)

One file belongs to exactly one batch. Anything outside your list is read-only to you — report it instead.

| Batch | Owns (create or edit) | Job |
|---|---|---|
| **1A Manifest + icons + head** | `src/app/manifest.ts`, `scripts/gen-pwa-icons.mjs`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-192.png`, `public/icons/maskable-512.png`, `public/icons/badge-mono-96.png`, `src/app/layout.tsx` | R1–R3. Run the generator once and commit its outputs. In layout.tsx: add `appleWebApp`, keep every existing icon entry, mount `<ServiceWorkerRegistrar />` (from 1B) inside `<body>`. Shortcuts: "Messages" → `/messages`, "My profile" → `/profile` (with the 192 icon). |
| **1B Service worker + registrar** | `public/sw.js`, `public/offline.html`, `scripts/pwa/sw-killswitch.js`, `src/components/pwa/ServiceWorkerRegistrar.tsx`, `src/lib/pwa/install-prompt.ts` | R4–R10, R13–R15. `offline.html` is fully self-contained: inline CSS and an inline SVG of the logo, no external fonts or scripts from other origins, cream `#FAF7F2`, "You're offline", a Try again button (reload), and an `online` listener that reloads. Keep sw.js readable in one sitting (≈150–200 lines). |
| **1C Gates + headers + checker** | `src/proxy.ts`, `next.config.ts`, `scripts/check-pwa.mjs` | R11, R12. `node scripts/check-pwa.mjs [baseUrl]` (default `http://localhost:3000`), GET-only: manifest fields per R1 and icon entries per R2; each icon fetched and its pixel size checked with sharp; `/sw.js` 200, no redirect, no `set-cookie`, R12 headers; `/offline.html` 200, no redirect, no `set-cookie`, and no `http(s)://` URL to another origin in its body; `/` HTML has `<link rel="manifest"` and the apple web-app meta tags. Exits non-zero with a plain list of failures. |
| **1D Static desktop pages** | `public/html/_sw.js`, `public/html/profile.html`, `public/html/messages.html`, `public/html/onboarding.html` | In each page's `<head>`: `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color" content="#FAF7F2">`, `<link rel="apple-touch-icon" href="/apple-icon.png">`, and `<script src="/html/_sw.js" defer></script>`. `_sw.js` registers per R9 on `www.connectvibe.app` only (no build env on static pages). These pages are thousands of lines: grep for `</head>` and edit ranges only. |
| **1E Standalone detection + copy** | `src/lib/pwa/display-mode.ts`, `src/lib/pwa/display-mode.test.ts`, `src/lib/pwa/use-standalone.ts`, `src/app/auth/signup/page.tsx`, `src/app/auth/school-email/page.tsx`, `src/lib/email/resend-transactional.ts`, `src/components/mobile/ResumeViewerMobile.tsx`, `src/components/legal/LegalLayout.tsx`, `src/app/globals.css` | R16, R17. `display-mode.ts` is PURE (no React, no `@/` runtime imports, no enums — house rule for node:test): `isStandalone(env)` from `{navigatorStandalone, matchStandalone, matchFullscreen}` and `detectPlatform({ua, maxTouchPoints})` → `"ios-safari" \| "ios-other-browser" \| "ios-in-app" \| "android-chrome" \| "android-samsung" \| "android-other" \| "desktop-chromium" \| "desktop-safari" \| "firefox" \| "other"` (iPadOS reports a Mac UA: `Macintosh` + `maxTouchPoints > 1` ⇒ iOS; in-app markers `Instagram`, `FBAN`/`FBAV`, `musical_ly`/`BytedanceWebview`/`TikTok`, `Snapchat`, `LinkedInApp` — mark these UNVERIFIED in a comment). `use-standalone.ts` is the client hook (`useIsStandalone()`, false on the server and first render, then real). |

**Contracts between batches (code against these, not against the other batch's in-progress file):**
- 1B exports `export function ServiceWorkerRegistrar(): null` from `src/components/pwa/ServiceWorkerRegistrar.tsx` (a `"use client"` component, no props). 1A imports it by that name.
- 1B's `install-prompt.ts` exports `getInstallPrompt(): BeforeInstallPromptEvent | null`, `onInstallPromptChange(cb): () => void`, `wasInstalledThisSession(): boolean`. It is imported for its side effect by the registrar so the listener attaches at load.
- 1E exports `isStandalone`, `detectPlatform`, `type Platform` from `display-mode.ts`; `useIsStandalone` from `use-standalone.ts`. Wave 3 builds on these.
- File names the others rely on: `/sw.js`, `/offline.html`, `/manifest.webmanifest`, `/icons/*.png`, `/html/_sw.js`.

**Gates every batch runs on its own files:** `npx tsc --noEmit -p .` (whole project; report only errors in your files), `npx eslint <your files>`, `node --check` on any plain .js you own, and `node --test --experimental-strip-types <your *.test.ts>`.

**DEFERRED — no agent may claim these; mark them DEFERRED in your report:** anything needing the dev server, a browser, a phone, or the network (manifest served, SW registered, offline page shown, install prompt, iOS behaviour). The orchestrator runs them after the wave on the local stack, then on production after deploy, then on Franky's iPhone (critic.md I1–I10).

**Wave 1 does not touch:** any migration, any `/api` route, `src/lib/push/*`, Settings, the campus banner, or push subscribe UI.

---

## §3 — Franky's decisions (2026-09-24, session 65)

| # | Decision | What it means for the build |
|---|---|---|
| D1 | **Every notification kind pushes, all on by default** (likes and follows included), plus DMs. | Per-kind switches still exist in Settings. Repeated likes on one post collapse into ONE updating notification (same `tag`) so a popular post doesn't buzz 40 times. The dead `connection` kind never pushes. |
| D2 | **Name + message text on the lock screen by default**, with a switch to hide previews. | Two safety exceptions told to Franky (he may overrule): a message REQUEST from someone the student doesn't follow shows the name but not the text; an invite to an invite-only / restricted-audience club doesn't name the club. Preview text passes `checkText` and is capped at ~100 characters. |
| D3 | **Install = real store apps.** A landing-page button sends students to the App Store / Google Play ("and more"); desktop (PC) onboarding tells students they can get Vibe on their phone. | Supersedes the PWA install-coaching banner (critic.md wave 3, 3D). The store route, and what the button does before listings are live, come from `research-stores/critic.md`. |
| D4 | Offline = the branded offline page only (recommended; not asked separately). | R18. |
| D5 | Sign-in doesn't change (recommended; not asked separately). | R16. Store apps may add Universal Links / App Links so email links open the app — see research-stores. |
| D6 | **Test push on the live site, founders only**: dark behind `PUSH_ENABLED` + a founder allowlist. | As critic.md D6 (b). |

**D2 addendum (Franky, 2026-09-25):** comments and @mentions from someone the recipient does NOT follow show the name
without the words (same rule as message requests). People the recipient follows show their text as normal.

**Wave 2 (push) is ON HOLD** until the store route is chosen: store apps may use native push (APNs/FCM) instead of, or next to, web push, so the outbox → dispatcher → sender design must be transport-agnostic (a subscription row has a `transport`).

---

## §4 — Store wave S1: reviewer-ready web (session 65)

Route and reasons: `research-stores/critic.md` (Capacitor 8 shell on both stores, pending Franky's D-answers). S1 is
route-independent: everything in it is something App Review / Play review checks, and useful for web students too.
Detail per batch: `research-stores/critic.md` §S1 and `research-stores/repo-readiness.md`. Wave 1 is shipped (`3f05c04`).

**THE REPO IS PUBLIC** (`FrankyCazares-Vibe/vibe`). No password, token, key or reviewer credential in any
committed file. `docs/` is the gitignored private `DOCS/` on this Mac — never put a deliverable there.

| Batch | Owns | Job |
|---|---|---|
| **S1A Report everywhere + hide on report (client)** | `src/app/campus/campus-home.tsx` (ranged edits only), `src/components/mobile/CampusMobile.tsx`, `src/app/orgs/[handle]/page.tsx`, `src/app/orgs/[handle]/OrgEventsSection.tsx` | A Report control on event cards (ReportSheet already supports `event`) and on club-page posts, matching the existing report controls. Feed lists listen for the `vibe:content-reported` window event (contract below) and drop that post at once. |
| **S1B Block holes + hide on report (server)** | `src/app/api/posts/[id]/comments/route.ts`, `src/app/api/posts/[id]/save/route.ts`, `src/app/api/posts/[id]/repost/route.ts`, `src/app/api/feed/route.ts`, `src/components/safety/ReportSheet.tsx` | Comment / save / repost refuse when either side has blocked the other (403, `{ok:false,error,code:"blocked"}`, house error shape), reusing the existing block helpers. The feed excludes posts the viewer has reported. ReportSheet dispatches `vibe:content-reported` after a successful report. Also check the `/api/me/reports` route (read-only unless it is the right place — report it). |
| **S1C Dead ends** | `src/app/auth/school-email/page.tsx`, `src/components/mobile/onboarding/OnbHeader.tsx`, `src/app/account/suspended/suspended-actions.tsx` | Sign out and Delete account on the unverified school-email screen and in the phone onboarding header, reusing the existing sign-out/delete code paths (keep their `clearDraft()` calls). After deletion go to `/auth/signup`, not the landing. |
| **S1D Public pages + landing** | `src/app/support/page.tsx`, `src/app/legal/delete-account/page.tsx`, `src/components/landing/home-landing.tsx`, `src/app/get/route.ts`, `.env.example` | `/support` (Apple's Support URL): help@connectvibe.app, the 24-hour line, links to Guidelines, Child Safety, Terms, Privacy, delete-account. `/legal/delete-account` (Play's deletion URL): in-app steps + email route, what is deleted and when. Both use LegalLayout and are public (check the proxy and page gates; report if the proxy blocks them). Landing footer: "CONNECTVIBE. LLC", links to Terms, Privacy, Guidelines, Support; drop "prototype / early access". A store-badge block driven by `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL` that renders NOTHING while both are unset (no dead buttons; official badge art is added later by Franky — leave a clear TODO and do not download anything). `/get`: 307 by user agent — iPhone/iPad → App Store URL, Android → Play URL, when set; otherwise `/campus` on phones and `/` on desktop. Document both env vars in `.env.example`. |
| **S1E Review kit** | `scripts/seed-review-accounts.mjs`, `src/lib/sentry-config.ts` (or wherever Sentry's URL scrubbing lives — if another file, report instead of editing), `handoffs/stores/review-notes.md` | Seed two App-Review accounts (school-verified, onboarded, Terms accepted, one post each, following each other) by service role. DRY RUN by default; `--apply` writes; refuses any Supabase URL that isn't 127.0.0.1/localhost unless `--production --i-have-frankys-yes` is passed; emails and passwords come from env/args, never the file. Do NOT run it against production. Sentry: scrub `/profile/<handle>` and `/api/users/<handle>/…` handles from event URLs like the existing scrubbing. Review notes (gitignored folder): a plain template listing native features + how to test report/block/delete. |

**Contract — hide on report:** after a successful report, ReportSheet calls
`window.dispatchEvent(new CustomEvent("vibe:content-reported", { detail: { targetType, targetId } }))` with the
same `targetType` / `targetId` values it sent to the API. Listeners remove matching posts (`targetType === "post"`).

**Gates, DEFERRED rule, file-size rules:** as §2. Agents may run the seed script only as a dry run against the local
stack (127.0.0.1:54321). No production writes.

---

## §5 — Store decisions (2026-09-24, session 65)

| # | Decision |
|---|---|
| SD1 | **Vibe+ is invisible inside both store apps at launch**: no price, buy button, link or upsell; web subscribers still see their Vibe+; checkout refuses requests from the apps (critic S2C). Store billing (RevenueCat → entitlements) comes after the LLC bank account. |
| SD2 | **18+ on both stores** (Apple 18+; Play "18 and over" + restrict minor access). Terms stay 18+. James's lawyer confirms Texas SB 2420 duties (Declared Age Range / Play Age Signals in v1.1 unless the lawyer says launch). |
| SD3 | **Franky builds and will enroll with Apple himself**; he is not yet sure whether the LLC is single- or multi-member or whose name it is under — he checks with James before enrolling. Engineering does not wait on it: Simulator + emulator until the accounts exist. |
| SD4 | **Only the two phone stores.** No Microsoft, Samsung, or others for now. |
| SD5 (orchestrator default, Franky may overrule) | Capacitor 8 shell on BOTH stores loading `https://www.connectvibe.app` (TWA kept as the Android fallback); Firebase Cloud Messaging for app push + web push for browsers and the iPhone fallback; the shell lives in `mobile/` in this repo with key/keystore ignore rules committed FIRST; permanent app id `app.connectvibe.vibe` on both platforms. |

---

## §6 — Wave S2+S3: the app shell and the web code that knows about it (session 65)

Detail: `research-stores/wrapper-tech.md` §4 (the stack, piece by piece) and `research-stores/critic.md` §S2–S3.
S1 shipped (`c0963b2`). Push (wave 2′) is NOT in this wave: no FCM token handling, no push UI, no migration.

**Already written by the orchestrator (read, don't rewrite):** `src/lib/native/detect.ts` —
`type AppShell = "ios-app" | "android-app"`, `detectAppShell(ua)`, `appShellOnClient()`; tests in `detect.test.ts`.

| Batch | Owns | Job |
|---|---|---|
| **S2A App mode in the web code** | `src/lib/native/server.ts`, `src/lib/native/use-app-shell.ts`, `src/lib/pwa/display-mode.ts`, `src/lib/pwa/display-mode.test.ts`, `src/components/pwa/ServiceWorkerRegistrar.tsx` | `server.ts` (server-only): `appShellFromHeaders(h: Headers): AppShell \| null` and `async appShellFromRequest()` via `next/headers`. `use-app-shell.ts` (client): `useAppShell(): AppShell \| null` — null on the server and first render, then `appShellOnClient()`. `detectPlatform` gains `"ios-app" \| "android-app"`, checked FIRST (it imports `detectAppShell`), pinned in tests; `isIosPlatform("ios-app")` stays false for the Safari/standalone copy (R16 must not fire in the app). The registrar does nothing inside the app (Android WebView would otherwise register the worker and take over Capacitor's offline page); it must still run its kill branch everywhere. |
| **S2B Native bridge (web side)** | `src/lib/native/bridge.ts`, `src/components/native/NativeBridge.tsx`, `src/app/layout.tsx`, `src/app/globals.css` | `bridge.ts` (client-only, no `@capacitor/*` npm import — talk to `window.Capacitor.Plugins` so the web bundle doesn't grow): `getPlugin<T>(name)`, `openInBrowser(url)` (Browser.open in the app, `window.open(url,"_blank","noopener")` otherwise), `nativeShare({title?,text?,url?,files?})` → boolean handled, `writeCacheFile(name, base64)` → uri \| null (Filesystem, Cache dir). `NativeBridge.tsx` mounted in the root layout, renders null, and in the app only: adds `html.vibe-app`; StatusBar dark text on cream `#FAF7F2`; `appUrlOpen` + `getLaunchUrl` → same-origin check (`https://www.connectvibe.app` only) → `location.assign(path+search+hash)`; Android `backButton` → `history.back()` if `canGoBack` else `App.exitApp()`; a capture-phase click handler for `a[target=_blank]`: same-origin → navigate in place, other origins (and `mailto:`/`tel:` untouched) → `openInBrowser`. globals.css: `html.vibe-app, html.vibe-app body { background-color:#FAF7F2 }` next to the R17 rule. |
| **S2C Store-safe Vibe+** | `src/app/plus/page.tsx`, `src/app/plus/PlusActions.tsx`, `src/components/otto/OttoMetrics.tsx`, `src/components/posts/PostAudienceList.tsx`, `src/lib/feedback/failure-copy.ts`, `src/app/api/billing/checkout/route.ts` | Plan §5 SD1. Inside the app: no price, no buy/subscribe button, no link to web checkout, no upsell copy anywhere (every Vibe+ teaser on phones — grep for "Vibe+" / "/plus" in the phone surfaces and report any this batch doesn't own). Comp/active members still see their status and the manage-subscription portal. `/plus` in the app for a non-member: a neutral "Vibe+ isn't available in the app" line, nothing to tap to buy. Checkout route: `appShellFromHeaders` → 403 `{ok:false,error:"Not available in the app",code:"store_app"}` BEFORE any Stripe call. Web behaviour unchanged. |
| **S2D Web-view hazards** | `src/components/mobile/ResumeViewerMobile.tsx`, `src/lib/feedback/request.ts`, `src/app/auth/signup/page.tsx`, `src/app/auth/terms/accept-terms-form.tsx`, `src/components/mobile/PostViewerMobile.tsx`, `src/components/mobile/onboarding/StepPeople.tsx` | wrapper-tech §4.5. In the app: résumé "Open"/"Open my original" hidden for proxied files (same rule as iOS standalone); `.ics` export (request.ts ~:234-271) → `writeCacheFile` + `nativeShare({files})`, falling back to a toast if either fails; legal links that use `target=_blank` open with `openInBrowser`; the phone post viewer's share uses `nativeShare({url})` first. The R16 "links open in your browser" line never shows in the app (the app gets its own email links later via Universal Links); code-first copy stays. |
| **S3A Shell scaffold + hygiene** (runs FIRST; S3B/S3C wait for it) | `mobile/**` except the files S3B/S3C own, `.gitignore`, `.vercelignore`, `tsconfig.json`, `eslint.config.mjs` | 1) `.gitignore` FIRST: `*.p8 *.p12 *.cer *.mobileprovision *.jks *.keystore keystore.properties google-services.json GoogleService-Info.plist mobile/node_modules mobile/ios/App/Pods` and Capacitor's generated/ignored paths. 2) `mobile/package.json` pinning `@capacitor/core cli ios android` 8.5.x + app, status-bar, splash-screen, browser, share, haptics, keyboard, filesystem, `@capacitor-firebase/messaging` 8.5.2 (installed but not wired — wave 2′), `@capacitor/assets` (dev). 3) `mobile/capacitor.config.ts` per wrapper-tech §4.1: `appId "app.connectvibe.vibe"`, `appName "Vibe"`, `webDir "www"`, server `url https://www.connectvibe.app`, `appStartPath "/campus"`, `errorPath "offline.html"`, `ios.appendUserAgent " VibeApp/1 (ios)"`, `android.appendUserAgent " VibeApp/1 (android)"`, no `allowNavigation`, iOS `contentInset "never"`; a DEV override when `CAP_DEV_URL` is set (`url` = it, `cleartext: true`) — local `next dev` + LOCAL Supabase only. 4) `mobile/www/index.html` (minimal) and `mobile/www/offline.html` (self-contained, same look as public/offline.html, Try again → reload to `/campus`). 5) `npx cap add ios` (SPM) and `npx cap add android`; `npx cap sync`. 6) Icons/splash from `src/app/icon.svg` into `mobile/resources/` and generated into both projects (App Store 1024 opaque, no alpha). 7) Exclude `mobile/` from root tsconfig, eslint and Vercel. 8) `mobile/README.md`: run/build steps, the dev URL flow, what must never be committed. Gate: `xcodebuild -project mobile/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO` succeeds. |
| **S3B iOS native** | `mobile/ios/App/App/AppDelegate.swift`, `mobile/ios/App/App/MainViewController.swift`, `mobile/ios/App/App/Info.plist`, `mobile/ios/App/App/PrivacyInfo.xcprivacy`, `mobile/ios/App/App/App.entitlements`, `mobile/ios/App/App/Base.lproj/Main.storyboard`, `mobile/ios/App/App.xcodeproj/project.pbxproj` | `MainViewController: CAPBridgeViewController` with `allowsBackForwardNavigationGestures = true` (storyboard points at it). Info.plist: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription` in Vibe's plain voice; `ITSAppUsesNonExemptEncryption` false; iPhone-only (`TARGETED_DEVICE_FAMILY = 1`); portrait. PrivacyInfo.xcprivacy: required-reason APIs Capacitor/WebKit use (UserDefaults CA92.1 etc. — cite the source), no tracking. Entitlements: `aps-environment development`, `com.apple.developer.associated-domains` `applinks:www.connectvibe.app` — but do NOT break an unsigned simulator build (keep entitlements referenced only in a way that builds with CODE_SIGNING_ALLOWED=NO, or document it). No Firebase code yet (wave 2′). Gate: the S3A xcodebuild command succeeds. |
| **S3C Android native** | `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/android/app/build.gradle`, `mobile/android/app/src/main/res/**` (notification icon, colors), `mobile/android/app/src/main/java/**/MainActivity.java` | App Links intent filter `autoVerify="true"` for `https://www.connectvibe.app` with the paths in wrapper-tech §4.3 (NOT `/`, `/legal`, `/api`, `/html`); `POST_NOTIFICATIONS`; a white-on-transparent small notification icon from `public/icons/badge-mono-96.png` art; channels `messages` and `activity` created in `MainActivity.onCreate` (API 26+); `google-services` plugin applied ONLY if `google-services.json` exists (Capacitor's template already does this — confirm). No Android SDK on this Mac: building is DEFERRED; check XML well-formedness and Gradle syntax by reading. |

**Contract notes:** S2B/S2C/S2D import `@/lib/native/detect` (exists), `@/lib/native/server` and `@/lib/native/use-app-shell` (S2A) and `@/lib/native/bridge` (S2B) — code against this table, not the in-progress files. S2D is the ONLY batch that edits ResumeViewerMobile and the signup page this wave.

**Rules:** as §2 (≤150-line Writes/Edits, gates, DEFERRED). The repo is PUBLIC: no keys, keystores, Firebase config files or Apple team ids in any committed file. S3 agents may run `npm install` inside `mobile/` only, `npx cap …` inside `mobile/`, and `xcodebuild` for the simulator with signing off. Nobody installs system software (Android Studio, CocoaPods, JDKs).

---

## §7 — Wave 2′: push notifications, one pipeline for browsers and the store apps (session 65)

Designs: `research/code-notifications.md` §B–§I (who writes what, what must suppress a push, lock-screen risk),
`research/critic.md` wave 2, `research-stores/wrapper-tech.md` §4.2 (FCM), `research-stores/critic.md` "PWA impact",
this file §3 (D1 all kinds on, D2 name + text, D6 founders-only dark launch) and R13–R14 (web payload + tap).
Client registration and the Settings card are wave 3′ — NOT this wave.

**Shape:** a `notifications` INSERT (triggers, mentions, club notices) or a DM/group message (route) → one
`push_outbox` row per recipient **only if the recipient has a registered device** → `drainPushOutbox()` claims rows,
re-checks every safety rule at send time (fail closed), builds ONE neutral message, and hands it to the transport of
each of the recipient's devices: Web Push (browsers, the installed web app) or FCM (both store apps).

| Batch | Owns | Job |
|---|---|---|
| **2A Migration** | `supabase/migrations/20260924120000_push_notifications.sql` | House template (header, pre-flight, a transaction that checks its own work, post-check, undo block — copy `20260922150000_billing_stripe.sql` / `20260923090000_moderation_foundation.sql`). `push_devices` (uuid id; `user_id` → users ON DELETE CASCADE; `transport` 'webpush'\|'fcm'; `address` text UNIQUE = endpoint or FCM token; `p256dh`, `auth` required for webpush and NULL for fcm (CHECK); `platform` 'ios-app'\|'android-app'\|'ios-web'\|'android-web'\|'desktop-web'\|'other'; `app_version`, `origin`, `created_at`, `last_seen_at`, `last_ok_at`, `failures`). `push_outbox` (uuid id; `recipient_id` → users CASCADE; `source` 'notification'\|'message'; `notification_id` → notifications CASCADE; `message_id` → messages CASCADE; exactly one set per source (CHECK); `created_at`, `claimed_at`, `attempts`, `sent_at`, `skipped_reason`; UNIQUE(notification_id); UNIQUE(message_id, recipient_id); a partial index for pending rows). Both: RLS on, ZERO policies, all rights revoked from anon/authenticated (tables AND any sequence), granted to service_role by name. AFTER INSERT trigger on `notifications` (SECURITY DEFINER, `search_path` pinned) inserts an outbox row only when `exists(select 1 from push_devices where user_id = new.user_id)`, and swallows its own errors (a like must never fail because of push). `claim_push_outbox(p_limit int)` SECURITY DEFINER: refuses unless the caller is service_role, then claims pending rows (unclaimed, or claimed > 2 min ago and attempts < 3) with `FOR UPDATE SKIP LOCKED`. **Never REVOKE EXECUTE on a public function** (it crashes production's Postgres; post-check count must be 0) — grant EXECUTE broadly and refuse inside. Apply to the LOCAL stack only (`supabase migration up`); production needs Franky's yes and is not this wave. Code must tolerate the tables being absent (42P01 / PGRST205) because code ships first. |
| **2B Device routes** | `src/app/api/me/push-devices/route.ts`, `src/lib/push/device-address.ts`, `src/lib/push/device-address.test.ts`, `src/app/api/auth/logout/route.ts`, `src/proxy.ts` | `POST /api/me/push-devices` `{transport, address, keys?: {p256dh, auth}, platform, app_version?}` → upsert by `address`, re-pointing `user_id` to the caller (a shared device changing hands). Route order per house rules: getUser → validate → rateLimit → requireNotRestricted + requireTermsAccepted → `pushAllowedFor(user.id)` (2C) → service write. Validation in pure `device-address.ts`: web endpoints must be https on a push-service host allow-list (fcm.googleapis.com, updates.push.services.mozilla.com, *.push.apple.com, web.push.apple.com, *.notify.windows.com) — SSRF guard; key lengths; FCM token shape. `DELETE /api/me/push-devices` `{address}` deletes the caller's row. `/api/auth/logout` accepts an optional `{push_address}` and deletes that row for the caller BEFORE signing out. Add `DELETE /api/me/push-devices` to the proxy's `restrictedApiAllowed`. Missing table = "no row" (never 500). |
| **2C Senders + config** | `src/lib/push/config.ts`, `src/lib/push/config.test.ts`, `src/lib/push/types.ts`, `src/lib/push/send-webpush.ts`, `src/lib/push/send-fcm.ts`, `src/lib/push/send-fcm.test.ts`, `src/app/api/health/push/route.ts`, `package.json`, `package-lock.json`, `.env.example` | `config.ts` (pure): `PUSH_SITE_ORIGIN = "https://www.connectvibe.app"`; `pushEnabled(env)` only when `PUSH_ENABLED === "true"`; `pushAllowedFor(userId, env)` = enabled AND (`PUSH_ALLOWLIST === "*"` OR the id is in the comma list); `vapidConfig(env)` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` which must be `mailto:`/`https:` and never localhost) → object or null; `fcmConfig(env)` (`FCM_SERVICE_ACCOUNT_B64`, base64 of the service-account JSON) → `{projectId, clientEmail, privateKey}` or null. `types.ts`: `type SendResult = {ok:true} \| {ok:false; gone:boolean; retry:boolean; config:boolean; status?:number}` and the FCM v1 message body type. `send-webpush.ts` (server-only, nodejs): `web-push` pinned at exactly 3.6.7; `sendWebPush(device:{address,p256dh,auth}, payload:string, opts:{ttl:number; urgency:"very-low"\|"low"\|"normal"\|"high"; topic?:string})`; TTL ≥ 1 always; VAPID headers cached per push-service origin for < 1 hour (Apple asks for no more than one JWT per hour); 404/410 → gone; 401/403 → config (never delete); 413 → no retry; 429/5xx → retry. `send-fcm.ts`: OAuth2 service-account JWT (RS256 via `node:crypto`, no new dependency) → token cached ~55 min → `POST https://fcm.googleapis.com/v1/projects/{id}/messages:send`; UNREGISTERED / 404 / invalid-token → gone; 401/403 → config; 429/5xx → retry. Never log an endpoint, token, key or message text. `/api/health/push` (platform admins only): which transports are configured, nothing secret. `.env.example`: every key above, marked Production-only + Sensitive, "never rotate the VAPID pair", and "never on Preview (it shares the production database)". |
| **2D Dispatcher, payload, badge** | `src/lib/push/payload.ts`, `src/lib/push/payload.test.ts`, `src/lib/push/dispatch.ts`, `src/lib/push/badge.ts`, `src/app/api/me/badge/route.ts` | `payload.ts` (pure): `type PushKind = "follow" \| "like" \| "comment" \| "mention" \| "org_invite" \| "org_request_approved" \| "dm" \| "group_message" \| "message_request"`; `type PushMessage = {kind; title; body; url; tag; badge; threadId?}` (`url` absolute on `PUSH_SITE_ORIGIN`); `toWebPush(m): string` = EXACTLY R13 (`web_push: 8030`, `notification: {title, body, navigate, tag, app_badge}`, top-level `app_badge`, `mutable: false`); `toFcm(m, token)` = `{token, notification:{title, body}, data:{url, tag, kind} (strings only), android:{collapse_key: tag, notification:{channel_id: "messages" for dm/group/request/chat mention else "activity", icon:"ic_stat_vibe", color:"#FF5C35", tag}}, apns:{headers:{"apns-collapse-id": tag ≤64 bytes}, payload:{aps:{badge, "thread-id": threadId ?? tag, sound:"default"}}}}`; wording per plan §3 D1/D2 (+ code-notifications.md §I): name + text by default (text through `checkText`, ≤100 chars, generic line if it fails), a "hide previews" preference, a message REQUEST from someone the recipient doesn't follow shows the name but not the text, invites/approvals to invite-only or restricted-audience clubs never name the club, media = "sent a photo/video", `connection` never pushes, club-channel messages push only through their @mention rows. Tags: `dm:<channel>`, `like:<post>`, `comment:<post>`, `follow:<actor>`, etc.; web Topic = first 32 chars of base64url(sha256(tag)). Preferences read from `users.otto_settings.push` = `{previews?: boolean (default true), off?: PushKind[] (default [])}`. `dispatch.ts` (server-only): `drainPushOutbox({limit?})`, `enqueueMessagePush({messageId, channelId, senderId})` (DM + group members except the sender, accepted or pending-request; club channels skipped; only recipients with devices), `kickPushDrain()` (schedules a drain with `after()` from `next/server`, swallowing errors). Send-time checks, fail closed (code-notifications.md §F): block either way, person mute, chat mute, per-person group mute, hidden club, removed source, restricted actor, restricted recipient, recipient without Terms consent, already read, stale (> 30 min old → skip), the kind switched off, per-recipient limit `push:<recipient>` 20/10 min and chat pair limit `push-pair:<actor>:<recipient>` 10/min (spend once per push, never peek; do NOT spend `mention:<actor>` again), one push per message when a DM and its @mention row share a message. Each outbox row ends with `sent_at` or a `skipped_reason`; a gone device is deleted. `badge.ts`: ONE unread total (notifications excluding blocked/muted actors + unread DM/group threads honouring chat mute) used by the payload and by `GET /api/me/badge` `{ok:true,total}`. Push disabled → the drain marks claimed rows skipped `"disabled"`. |
| **2E Writer kicks** | `src/app/api/me/threads/[id]/messages/route.ts`, `src/app/api/me/follow/route.ts`, `src/app/api/posts/[id]/like/route.ts`, `src/app/api/posts/[id]/comments/route.ts`, `src/lib/mentions.ts`, `src/lib/orgs/membership.ts` | After each successful write: the messages route calls `enqueueMessagePush(...)` then `kickPushDrain()` (DM/group only; club channels rely on their @mention rows); follow, like and comment routes call `kickPushDrain()` (their triggers already queued the row); `insertMentionNotifications` and `notifyOrg` call `kickPushDrain()` after inserting, which covers every caller. Never block or fail the response on push; no push work on a refused write. |

**Contracts between batches** (code against these, not in-progress files): 2B imports `pushAllowedFor` from
`@/lib/push/config` (2C). 2D imports `sendWebPush` / `sendFcm` / `SendResult` / config helpers (2C). 2E imports
`kickPushDrain`, `enqueueMessagePush` from `@/lib/push/dispatch` (2D). Table and column names exactly as 2A above.

**Rules:** as §2 and §6. No production database access at all. Agents may apply the migration to the LOCAL stack
(127.0.0.1:54321) and read it; no push is sent to any real device or service in this wave (unit tests with fakes;
DEFERRED for live sends). The repo is PUBLIC: no key, token, service-account JSON or VAPID private key in any
committed file.

---

## §8 — Wave 3′: push on the student's side (session 66, 2026-09-25)

Maps: `w3-maps/3A-settings.md`, `3B-client-push.md`, `3C-signout.md`, `3D-native.md`, `3E-asks.md` (read-only readers,
every claim cited). Where a map and this section disagree, **this section wins**. Two waves: **3′a** (the machinery
students touch: Settings card, client library, native shells, every sign-out) then **3′b** (the asks and "get the app").

### §8.1 Rulings

| # | Ruling |
|---|---|
| W1 | **Device state vs account preferences are two things.** "Notifications on this device" = OS permission + a `push_devices` row. "What to send" (per-kind switches + previews) = `users.otto_settings.push` + `mention_pings`, account-wide. The card shows both and says which is which. |
| W2 | **The card is invisible unless push is available for this student** (`GET /api/me/push-devices` → `available`). During the dark launch (founders on `PUSH_ALLOWLIST`) nobody else sees a Notifications card, an ask, or a permission prompt. No prompt is ever shown before `available` is known. |
| W3 | **Mentions have ONE key: `mention_pings`.** The Settings "Mentions" switch reads `mention_pings !== false && !push.off.includes("mention")` and writes `mention_pings` (and, when turning ON, sends a `push.off` without `"mention"`). Otto's chattiness presets stop writing `mention_pings` (it is only read by push: grep confirms). The dispatcher's reader (`parsePushPrefs`) is unchanged. |
| W4 | **`push.off` is a full replacement list**; `push.previews` a boolean. The route merges `push` ONE level deep (a patch with only `previews` keeps `off`). Unknown kinds are DROPPED, not 400 (forward-compatible, same as the reader). |
| W5 | **Shared-device safety.** A device record in localStorage `vibe_push_device_v1 = {v:1, user, transport, address, at}` says who opted in on this device. On every open (resync), if a subscription/token exists but the record is missing or names another user (session expired, someone else signed in): the device is removed server-side (DELETE by address, **any owner** — possession of the endpoint/token is the capability, same as the logout route) and unsubscribed locally. A new account on the same device never inherits the previous student's pushes and never gets pushes without its own tap. Exception: record missing but the address's hash IS in this user's `devices` list (Safari's 7-day storage wipe) → rebuild the record, keep it. |
| W6 | **Resync never prompts and rarely writes.** On open: no subscription/token and no record → zero network. Otherwise one `GET /api/me/push-devices`; POST only when this device's hash isn't in `devices`, the address rotated, or the last successful POST is > 7 days old. At most one resync attempt per page load, and none within 10 min of a failed one. Native resync calls `getToken()` ONLY when a record with `transport:"fcm"` exists (getToken switches Firebase auto-init on for good). |
| W7 | **Sign-out order.** The three `/api/auth/logout` paths send `pushLogoutBody()` (`{push_address}` from the record) and run `leaveDeviceClean({serverDelete:false})` only AFTER the logout succeeded, then navigate as today. The two browser-only `signOut({scope:"local"})` paths run `leaveDeviceClean({serverDelete:true})` BEFORE `signOut` (after it, DELETE would 401). Delete-account runs `leaveDeviceClean({serverDelete:false})` after success (the FK cascade already dropped the rows). |
| W8 | **Chat tags stay one per message** (`payload.ts` unchanged). Instead `public/sw.js`, before showing a chat push whose tag is `dm:<channel>:<message>`, closes this origin's open notifications whose tag starts with `dm:<channel>:` — so browsers show one current notification per thread that still alerts (works in Firefox and Safari too, where `renotify` doesn't exist). iOS 18.4+ declarative pushes never run the worker and stack per message, which is fine. The store apps keep per-message ids grouped by `thread-id`. No `renotify`. |
| W9 | **`SIGNED_OUT` in the worker** also closes every shown notification and clears the app badge (a shared phone must not keep the last student's lock screen). |
| W10 | **Web badge:** installed web app only (`standalone` + `navigator.setAppBadge`): on `visibilitychange → visible`, at most once a minute, `GET /api/me/badge` → `setAppBadge(total)` (0 → `clearAppBadge`). **Store-app badge: not this wave** (the plugin has no badge API; wave 4 looks at a tiny local plugin). |
| W11 | **Native plumbing:** `@capacitor-firebase/messaging` 8.5.2 exact (installed + synced by the orchestrator before the wave). AppDelegate gets ONLY the two device-token forwarders (no Firebase import, no `FirebaseApp.configure()` — the plugin configures Firebase itself and skips when `GoogleService-Info.plist` is absent, so a build without the file can't crash). Auto-init OFF on both platforms (Info.plist `FirebaseMessagingAutoInitEnabled=false`, manifest `firebase_messaging_auto_init_enabled=false`): no token and no Firebase contact before a student opts in. iOS `presentationOptions: ["alert","badge","sound"]`; Android shows nothing in the foreground (FCM default) — noted for the device pass. The plist reaches the bundle by a Run Script phase that copies it when present and warns otherwise; `release:check` fails a release without it (and without `google-services.json`). |
| W12 | **Taps in the app:** a root-level listener (NativeBridge, app mode only, attached on EVERY page load because the shell drops listeners per load; the plugin holds a cold-start tap until the first listener) → dedupe by id (Android `notification.id`; iOS `notification.data["gcm.message_id"]`; last 20 in `vibe_push_taps_v1`) → URL from `notification.data.url` accepted only if its origin is `https://www.connectvibe.app` or the page's own origin → `location.assign(path+search+hash)`. `tokenReceived` → `resyncDevicePush()`. |
| W13 | **iPhone browser tab = "needs install".** Web push on iPhone only works from the Home Screen app, so an iOS browser tab shows the "needs install" state: the App Store link when `NEXT_PUBLIC_APP_STORE_URL` is set, else short Add-to-Home-Screen steps (the Apple-late fallback). Never the permission prompt. |
| W14 | **Denied:** the card shows how to turn it back on for THIS platform (iOS app / Android app / iPhone Home Screen app / Chrome / Edge / Safari desktop / Firefox), in one or two plain lines. No prompt re-ask (browsers ignore it). |
| W15 | **Restricted students** never reach /settings (proxy). They keep logout (deletes every device) and `DELETE /api/me/push-devices`. Nothing new needed. |

### §8.2 Contracts (code against these, not against in-progress files)

**Server — `GET /api/me/push-devices`** (3B adds it to the existing route; POST unchanged):
`401` signed out · `429` over `push-devices-read:<uid>` 120/h · else `200 {ok:true, available, webpush_key, fcm, user, devices}`:
`available = pushAllowedFor(uid)` (already includes PUSH_ENABLED + a site origin); `webpush_key = vapidConfig()?.publicKey ?? null`;
`fcm = fcmConfig() !== null`; `user = uid`; `devices` = for each of the caller's rows, the first 16 hex chars of
`sha256(address)` (`[]` when the table is missing or `available` is false). No Terms gate (read-only; the card lives behind
the Terms-gated pages anyway). **`DELETE` changes to delete the row with that address whoever owns it** (W5); the answer is
still `{ok:true}` either way.

**`src/lib/pwa/device-push.ts`** (3B; browser-only module, no React, never throws, never navigates, `vibeRequest`
always `quiet:true`):
```ts
export type DevicePushStatus =
  | { kind: "hidden" }                                        // not available for this account, signed out, or the GET failed
  | { kind: "unsupported"; why: "browser" | "app-update" | "app-build" } // no Push API / old app binary without the plugin / no Firebase config in this build
  | { kind: "needs-install" }                                 // iPhone browser tab (W13)
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" };
export type TurnOnResult = { ok: true } | { ok: false; status: DevicePushStatus; message?: string };
export function readDevicePush(): Promise<DevicePushStatus>;
/** NOT an async function: the permission prompt starts before the first await (iOS needs it inside the tap).
 *  "default"/"prompt" after the prompt = not now → {ok:false,status:{kind:"off"}}. 403 push_unavailable → unsubscribe/deleteToken, {kind:"hidden"}. */
export function turnOnDevicePush(): Promise<TurnOnResult>;
export function turnOffDevicePush(): Promise<boolean>;       // DELETE {address} + unsubscribe/deleteToken + drop the record; true if the device is now off
export function resyncDevicePush(): Promise<void>;           // W5 + W6; safe to call on every load, from anywhere
export function pushLogoutBody(): { push_address?: string }; // synchronous, from the record
export const PUSH_DEVICE_KEY = "vibe_push_device_v1";
```
Web: prefers `window.pushManager` when present (iOS 18.4+), else the SW registration's; looks for an existing
subscription in BOTH when reading or leaving. The registration comes from `navigator.serviceWorker.getRegistration("/")`,
else `ready` raced against a 4 s timeout (it never resolves where no worker registers). `applicationServerKey` from the GET's
`webpush_key` (base64url → Uint8Array); an existing subscription with a different key is unsubscribed first.
POST body `{transport:"webpush", address: endpoint, keys:{p256dh, auth}, platform}`; app: `{transport:"fcm", address: token,
platform: "ios-app"|"android-app", app_version?}`. Platform map: `ios-*` browsers → `ios-web`, `android-*` → `android-web`,
`desktop-*`/`firefox` → `desktop-web`, `other` → `other`.

**`src/lib/pwa/device-push-logic.ts`** (3B, pure, + `.test.ts`): `pushPlatformFor(p: Platform)`, `base64UrlToBytes(s)`,
`addressHash(address): Promise<string>` (WebCrypto sha256 → first 16 hex), `parseDeviceRecord(raw: unknown)`,
`resyncAction({record, currentAddress, user, devices, now}) → "none"|"post"|"rebuild"|"evict"|"forget"` (the W5/W6 table,
exhaustively tested).

**`src/lib/pwa/leave-device-clean.ts`** (3B): `export function leaveDeviceClean(opts: { serverDelete: boolean }): Promise<void>` —
never throws, never navigates, finishes within ~3 s (each step raced against a timeout). Steps: (1) `serverDelete` and a
record → `DELETE /api/me/push-devices {address}` (quiet, `keepalive`); (2) unsubscribe every web subscription found /
native `deleteToken()` when the record says `fcm`; (3) `{type:"SIGNED_OUT"}` to the active worker; (4)
`navigator.clearAppBadge?.()`; (5) remove `vibe_user_v1 vibe_posts_v1 vibe_vibes_v1 vibe_relationships_v1
vibe_otto_lastpost_v1 vibe_otto_v1 vibe_cal_events_v1 vibe_recent_searches_v1 vibe_push_device_v1 vibe_push_taps_v1
vibe_push_ask_v1 vibe_first_dm_ask_v1 vibe_push_sync_fail_v1`; (6) `clearDraft()`. Never touches tour-seen keys or
`vibe.launchUrlHandled`.

**`src/lib/native/push-native.ts`** (3C; imports only `./bridge`; never throws):
```ts
export type NativePermission = "granted" | "denied" | "prompt";           // "prompt-with-rationale" → "prompt"
export function nativePushPluginPresent(): boolean;                         // getPlugin("FirebaseMessaging") !== null
export function nativeCheckPermission(): Promise<NativePermission | null>;  // null = no plugin / call failed
export function nativeRequestPermission(): Promise<NativePermission | null>; // the plugin call starts synchronously
export function nativeGetToken(): Promise<{ ok: true; token: string } | { ok: false; unavailable: boolean }>; // one retry after 1.5 s; unavailable = Firebase not configured in this build (iOS code "UNAVAILABLE"; Android message mentions FirebaseApp not initialized)
export function nativeDeleteToken(): Promise<boolean>;
export function nativeAppVersion(): Promise<string | null>;                 // App.getInfo().version, kept only if /^[0-9A-Za-z._+-]{1,32}$/
export function onNativePushTap(cb: (url: string, id: string | null) => void): () => void;  // notificationActionPerformed
export function onNativeTokenRefresh(cb: (token: string) => void): () => void;            // tokenReceived
```

**`src/lib/native/bridge.ts`** (3C) adds `pushTapPath(url: unknown, pageOrigin: string): string | null` — like
`appPathFromLink` but also accepts the page's own origin (a local dev app on `http://localhost:3000`).

**`src/lib/native/store-links.ts`** (3A, new, pure, + `.test.ts`; lifted from `src/app/get/route.ts:31-43` — 3′b moves
`/get` and `home-landing.tsx` onto it): `storeListingUrl(raw, prefix)`, `APP_STORE_URL`, `PLAY_STORE_URL` (read with the
literal `process.env.NEXT_PUBLIC_…` so Next inlines them), `storeUrlFor(p: Platform | null): string | null` (iOS browsers →
App Store, Android browsers → Play, the apps / desktop / null → null).

**Settings data:** `src/app/settings/page.tsx` adds `otto_settings` to its select and passes
`pushPrefs: { previews: boolean; off: PushKind[]; mentionPings: boolean }` (built with `parsePushPrefs` from
`@/lib/push/payload`, pure) — never the raw blob. `PATCH /api/me/otto/settings` accepts `push: {previews?, off?}` (W4) and
answers the saved blob as today; it gains `rateLimit("otto-settings:<uid>", {limit: 120, windowSec: 600})`.

### §8.3 Wave 3′a — four batches, one owner per file

| Batch | Owns | Job |
|---|---|---|
| **A Settings card** | `src/components/settings/NotificationsCard.tsx` (new), `src/components/settings/notifications-card-view.ts` + `.test.ts` (new, pure), `src/components/settings/SettingsClient.tsx`, `src/app/settings/page.tsx`, `src/app/api/me/otto/settings/route.ts`, `src/components/otto/OttoSettings.tsx`, `src/lib/native/store-links.ts` + `.test.ts` (new) | The card (`id="notifications"`, after Campus tour, same `CARD_GLASS` chrome — keep the chrome local or pass it; don't restructure SettingsClient). Renders **nothing** while loading or `hidden` (W2). **Device row** "Notifications on this device" + a cream `role="switch"` (≥44px hit area, `aria-checked`, `#FF5C35` when on): off→on calls `turnOnDevicePush()` directly in `onClick` (no `await` before it); on→off `turnOffDevicePush()`; busy state; result text inline. Other states: needs-install (W13, `storeUrlFor`), unsupported (three plain lines by `why`), denied (W14 help, per platform from the view). **"What to send"** (shown whenever the card shows; "These apply everywhere your notifications are on."): Messages — Direct messages, Group chats, Message requests · Activity — New followers, Likes, Comments, Mentions in posts and club chats · Clubs — Club invites, Club requests approved · plus "Show message previews" ("Names always show. Turn this off to hide the words and club names."). Saves per W3/W4: optimistic, 350 ms debounce, single flight, roll back on failure (the OttoSettings pattern), `vibeRequest` failure copy. Route: W4 + the rate limit. Page: the `pushPrefs` prop. OttoSettings: presets stop touching `mention_pings` (and the "which preset is active" check ignores it). **Sign out** (SignOutCard) and **Delete account** (DangerZone) per W7. Subtitle and page metadata mention notifications. store-links per §8.2. |
| **B Client library, worker, route** | `src/lib/pwa/device-push.ts`, `src/lib/pwa/device-push-logic.ts` + `.test.ts`, `src/lib/pwa/leave-device-clean.ts` (all new), `src/components/pwa/ServiceWorkerRegistrar.tsx`, `public/sw.js`, `src/app/api/me/push-devices/route.ts` | §8.2 exactly. device-push.ts imports `push-native.ts` (C) for the app branch. Registrar: after a successful web registration, one `resyncDevicePush()` (idle, after load); W10 badge. sw.js: W8 + W9, bump `SW_VERSION`, fix the stale comments. Route: GET + DELETE-any-owner; update the header comment. |
| **C Native** | `src/lib/native/push-native.ts` (new), `src/lib/native/bridge.ts`, `src/lib/native/bridge.test.ts` (new, `pushTapPath` only), `src/components/native/NativeBridge.tsx`, `mobile/capacitor.config.ts`, `mobile/ios/App/App/AppDelegate.swift`, `mobile/ios/App/App/Info.plist`, `mobile/ios/App/App.xcodeproj/project.pbxproj`, `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/scripts/check-release-config.mjs`, `mobile/README.md` | §8.2 + W11 + W12. Verify every plugin method/event name against `mobile/node_modules/@capacitor-firebase/messaging/dist/esm/definitions.d.ts` (installed, 8.5.2). NativeBridge (app mode only): the tap listener (W12) and `onNativeTokenRefresh → resyncDevicePush()`, plus one `resyncDevicePush()` per load. pbxproj: a Run Script phase after Resources that copies `${SRCROOT}/App/GoogleService-Info.plist` into `${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/` when present, else `echo "warning: …"`; `ENABLE_USER_SCRIPT_SANDBOXING = NO` on the App target's Debug and Release; unique 24-hex ids. After editing capacitor.config.ts run `npx cap copy` inside `mobile/` (fast; regenerates the synced config). README: a "Push" section (where the two Firebase files go, never commit them, auto-init off, Debug has no push entitlement). Do NOT run xcodebuild, `cap sync`, npm install or simctl — the orchestrator builds. |
| **D Every other sign-out** | `src/app/account/suspended/suspended-actions.tsx`, `src/app/auth/terms/accept-terms-form.tsx`, `src/app/auth/verify-school/page.tsx`, `src/components/auth/EmailLinkProblem.tsx`, `src/lib/moderation/actions.ts` | W7 in each (`useLeaveAccount` covers the suspended page, the school-email page and the phone onboarding sheet: sign-out + delete). EmailLinkProblem stays on its page afterwards — the helper never navigates. `restrictUser`: after the restriction is written, delete that user's `push_devices` rows with the service client it already has — non-fatal, tolerant of a missing table (`isMissingPushSchema`), logged by code only. |

**Wave 3′a does not touch:** `src/lib/push/payload.ts`, `dispatch.ts`, any migration, OttoMobile, MessagesMobile,
CampusMobile, onboarding.html, `/get`, the landing page.

### §8.4 Wave 3′b — the asks and "get the app" (planned now, specified in full after 3′a lands)

- **E Asks:** one shared `src/components/push/PushAsk.tsx` + pure `push-ask-view.ts` (+ test). Store app → native ask;
  installed web app → web ask; an iPhone/Android browser tab → "Get the app" ONLY when `storeUrlFor` returns a URL; desktop
  → nothing. Hidden when the device status is `on`/`denied`/`hidden`/`unsupported`; "Not now" snoozes 14 days in
  `vibe_push_ask_v1`; every storage call in try/catch. Placements: the top of Otto's Today pane; after the first DM sent on
  this device (`vibe_first_dm_ask_v1`, DMs only, not club channels); a post-tour Campus card in the CampusConfirmBanner slot,
  one card at a time (the banner reports `onVisibleChange`). MessagesMobile also refetches the thread list quietly on
  `visibilitychange → visible` (debounced) and opens a new `?channel=` when the id changes.
- **F Get the app:** `/get` and `home-landing.tsx` move onto `store-links.ts`; desktop onboarding step 6 gets a "Get Vibe
  on your phone" card with a static QR of `https://www.connectvibe.app/get` (a light tile on the dark page, copy in
  `ONB_COPY`, hidden on touch devices). How the QR SVG is generated is decided before 3′b.

### §8.5 Rules, gates, DEFERRED

- `AGENTS.md`: this Next.js differs from training data — read the relevant guide under `node_modules/next/dist/docs/`
  before writing Next-specific code (route handlers, `after`, headers).
- Tool calls stay small: create files in ≤150-line Writes and grow them with ≤150-line Edits; never Read a file over
  ~1500 lines whole (grep, then ranged Reads). SettingsClient is 1642 lines; MessagesMobile 4746.
- Pure modules run under `node --test --experimental-strip-types`, so they import VALUES only by relative path (no `@/`),
  and a test loads its subject through a variable specifier (`const specifier = "./x.ts"; await import(specifier)` — a
  literal ".ts" import breaks `tsc`, TS5097). `import type` from `@/…` is fine (erased).
- **Gates each batch runs on its own files:** `npx tsc --noEmit -p .` (report only errors in your files),
  `npx eslint <your files>`, `node --check` on plain `.js`/`.mjs` you own, `node --test --experimental-strip-types <your tests>`.
- No dev server, browser, simulator, `xcodebuild`, `simctl`, npm install, network, or production database. The repo is
  PUBLIC: no keys, tokens, Firebase config files or team ids in any file.
- **DEFERRED (no agent may claim):** anything needing a running site, browser, device or real push: the prompt, a real
  subscription or token, delivery, taps, the badge, the iOS build, the Android build. The orchestrator runs the local
  browser pass (375 px, a non-admin), the iOS simulator build, then production dark behind the founder allowlist.
- Report: files changed, gates run with results, anything in a file you don't own that needs changing (don't change it),
  DEFERRED items.

### §8.6 Wave 3′a as built (`1a0da72`, 2026-09-25)

- Settings card, client library, native wiring and every sign-out shipped as §8.2 + critic-w3.md, with the repairs
  from four adversarial reviews (A: choices kept when the card hides/reappears, sign-out/delete wrapped; B: leave
  can't be starved by a busy queue — keepalive DELETE first, `clearShownNow()` on timeout, turn-on aborts if a leave
  ran meanwhile; evict works even when the app can't read its token (approved change to critic item 1: with a record,
  always GET; another user's record → evict by the record's address); sw.js never closes the push's own tag;
  `TOKEN_MS` 23 s so push-native's retry fits).
- Extra exports: `clearShownNow()`, `leaveDevicePush()`, `PUSH_SYNC_FAIL_KEY` (device-push.ts);
  `drainUnusedPushEvents()` (push-native.ts). `resyncAction` has a web-only `"resubscribe"` outcome.
- Verified locally: prefs save/merge/mentions/presets in the DB; Settings sign-out (logout body, all rows gone, 12 keys
  cleared, taps + tour kept); shared-device evict on the next load; stale-record forget (row 8); the iPhone app
  (simulator, local dev URL) — card shows, the native prompt appears from the tap, then "Notifications aren't set up in
  this version of the app yet." (no plist); app launches without the plist; `next build` clean with no node:crypto in
  client chunks.
- **iOS app icon count paused**: `toFcm` sends no `aps.badge` until wave 4.

### §8.7 Wave 3′b — the asks and "get the app" (full spec)

**Rulings.** B1 One shared component decides every ask; placements only mount it. B2 A push ask shows only when the
device status is `off` (store app, or the installed web app). Never on `on`/`denied`/`hidden`/`unsupported`/
`needs-install`, never before the status is known, never on desktop (W2 stays: no ask for a student push isn't
available to). B3 In an iPhone/Android BROWSER TAB the ask is "Get the app" — only when `storeUrlFor(platform)`
returns a URL (so nothing until the listings exist); in-app browsers (Instagram/TikTok) show nothing yet. B4 (critic
26) one message per platform: in an Android tab, once the Play URL is set, asks say "Get the app"; Settings keeps its
web-push switch (explicit choice). B5 "Not now" snoozes that placement 14 days in `vibe_push_ask_v1`
(`{otto?, campus?}` epoch ms); the DM ask shows once per device (`vibe_first_dm_ask_v1` = "1" when first shown). Every
storage call in try/catch; storage failing = show nothing. B6 The push button calls `turnOnDevicePush()` directly in
`onClick`; after `ok` the ask thanks briefly ("You're set.") and hides; `denied` hides it and says Settings has the
steps; other failures show the message inline. 44 px targets; dark style on Otto, cream elsewhere.

**Contract** — `src/components/push/push-ask-view.ts` (pure, + test):
`pushAskView({placement: "otto"|"campus"|"dm", shell: AppShell|null, standalone: boolean, platform: Platform|null,
status: DevicePushStatus|null, snoozedAt: number|null, dmShown: boolean, storeUrl: string|null, now: number})
→ {kind:"none"} | {kind:"push"; title; body; cta} | {kind:"get-app"; title; body; href}` with the copy.
`src/components/push/PushAsk.tsx`: `export function PushAsk(p: {placement: "otto"|"campus"|"dm"; suppressed?: boolean;
onVisibleChange?: (visible: boolean) => void}): JSX.Element | null` — reads `readDevicePush()` once on mount (not when
`suppressed`), renders null until known.

| Batch | Owns | Job |
|---|---|---|
| **E1 The ask** | `src/components/push/PushAsk.tsx`, `src/components/push/push-ask-view.ts` + `.test.ts` (new) | B1–B6 + the contract. Copy: Otto "Get these on your lock screen" / "Otto can tell you about messages, follows and your clubs, even when Vibe is closed." · Campus "Turn on notifications" / "Know when someone messages you or your clubs post." · DM "Know when they reply" (one line + button) · Get the app "Vibe is better in the app" / "Messages and club news on your lock screen." |
| **E2 Otto + Campus** | `src/components/mobile/OttoMobile.tsx`, `src/components/mobile/CampusMobile.tsx`, `src/components/mobile/CampusConfirmBanner.tsx` | Otto: `<PushAsk placement="otto"/>` first in the Today pane. Campus: the banner slot renders the confirm banner OR the ask, never both — the banner gains `onVisibleChange`; the ask mounts `suppressed` while the banner shows, while the tour runs, or on `?welcome=1`. |
| **E3 Messages** | `src/components/mobile/MessagesMobile.tsx` (4746 lines: ranged reads only) | After a successful DM send (`thread?.type === "dm"` only), show `<PushAsk placement="dm"/>` above the composer once per device. Refetch the thread list quietly on `visibilitychange → visible` (at most every 30 s, no toast on failure). Open a new `?channel=`/`?to=` when its value changes while mounted (the one-shot refs). |
| **F Get the app** | `src/app/get/route.ts`, `src/components/landing/home-landing.tsx`, `public/html/onboarding.html` (4033 lines: grep + ranges), `public/icons/get-qr.svg` (orchestrator-generated) | `/get` and the landing use `store-links.ts` (behaviour unchanged). Desktop onboarding step 6, between `.onb-list` and `.cta-row`: a "Get Vibe on your phone" card with `<img src="/icons/get-qr.svg">` on a light tile and the plain URL `connectvibe.app/get`, copy in `ONB_COPY` (`data-copy`), hidden when `navigator.maxTouchPoints > 0`. |
