# Wave 1 plan critic (2026-09-24)

Adversarial read of `plan.md` §1–§2 against the repo, `critic.md` and the research. Read-only; no server,
browser or network used. **Precedence: a RULING here overrides the plan line it names.** Everything
not named here stands as written.

**Plain English.** Two rulings would take the live site down if coded literally: the worker's
navigation shorthand (every page load could fail) and the install-prompt module touching `window`
while the server renders the root layout (every page would error). Four more would ship quietly broken:
the kill-switch drill never reaches zero, a notification tap can load the whole app inside the desktop
messages iframe, the checker fails the offline page 1B is told to write, and it looks for a meta tag
Next 16.3 no longer emits. The rest are ownership gaps and platform facts (Android shares Chrome's
cookies, so hiding résumé "Open" and "links open Safari" copy are iOS-only).

---

1. **1B — blocking — R4's `respondWith(preloadResponse ?? fetch(request))` fails navigations.**
   `FetchEvent.preloadResponse` is a Promise whenever the browser supports navigation preload (Chrome 59,
   Firefox 99, Safari 15.4). It is never nullish, so `??` never falls back to `fetch`. When preload is
   not on for that fetch (enable() not yet run or failed, or a browser quirk), the promise resolves to
   `undefined`, and `respondWith(undefined)` is a network error: the page doesn't load. The research had
   this right (`research/web-nextjs-sw.md:212`); the plan's shorthand loses it.
   **RULING:** the navigation branch is exactly this shape. Call `respondWith` synchronously. Any error
   other than a genuine offline must still fall through to the network, never to a rejected promise.
   ```js
   event.respondWith((async () => {
     try {
       const preloaded = await event.preloadResponse;   // may be undefined
       if (preloaded) return preloaded;
       return await fetch(event.request);
     } catch {
       return (await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })) || inlineOfflineResponse();
     }
   })());
   ```
   In `activate`, guard `if (self.registration.navigationPreload)` and put `enable()` and `clients.claim()`
   inside `event.waitUntil`. `inlineOfflineResponse()` sends `Content-Type: text/html; charset=utf-8`.

2. **1B — blocking — `install-prompt.ts` "captures at module load", but the module is evaluated on the server.**
   A `"use client"` module still runs during SSR. The registrar imports it, and 1A mounts the registrar in
   the ROOT layout (`src/app/layout.tsx:47`), so a top-level `window.addEventListener(...)` throws
   `ReferenceError: window is not defined` on every page render.
   **RULING:** in `install-prompt.ts`, all module-level work sits behind `if (typeof window !== "undefined")`.
   The getters return `null` / `false` on the server. The registrar does all its work inside `useEffect`.
   Also export the type: `export interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>;
   userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }> }`. TS's DOM lib has no
   such type, and wave 3 imports it from here.

3. **1C — major — a matcher typo can switch the proxy off site-wide, and no acceptance check would notice.**
   The matcher is a negative lookahead (`src/proxy.ts:316`). A stray `|` (an empty alternative) makes the
   lookahead fail on EVERY path. The proxy would then never run: no session refresh, no suspension gate
   (`:235–245`), no `/html` guard (`:247–295`). The planned checker only makes anonymous GETs, which pass
   whether or not the exclusion works (no session means no cookie either way).
   **RULING:** the matcher becomes exactly
   `"/((?!_next/static|_next/image|favicon\\.ico|sw\\.js$|offline\\.html$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"`.
   The `$` makes each one an exact path, not a prefix. `check-pwa.mjs` also runs a local, network-free
   test first: read `src/proxy.ts`, pull out the matcher's double-quoted literal, `JSON.parse` it, wrap
   it in `^(?:…)$`, and assert:
   - these must NOT match: `/sw.js`, `/offline.html`, `/manifest.webmanifest`, `/icons/icon-192.png`
   - these MUST match: `/`, `/campus`, `/api/me`, `/html/profile.html`, `/html/_sw.js`,
     `/account/suspended`, `/offline`

   The checker also GETs `/html/profile.html?app=1&handle=zzzz` (the only static page an anonymous
   visitor can load, proxy.ts:262–266) and asserts the 1D tags (item 13). That gives 1D a check that can
   actually run.

4. **1B + 1D — major — the kill-switch drill can't reach "0 registrations".**
   R7's drill only replaces `public/sw.js`. R8's `NEXT_PUBLIC_SW_KILL` stops only the React registrar.
   `public/html/_sw.js` has no build env ("no build env on static pages", plan:45), so the desktop app
   (`/html/profile.html?app=1`, `/html/messages.html` inside the `/messages` iframe, `MessagesSwitch.tsx:45`)
   registers `/sw.js` again on every load. The killswitch then installs and removes itself over and over.
   Also, `WindowClient.navigate()` rejects for a client this worker doesn't control, and Safari support for
   it is unconfirmed.
   **RULING:**
   - `_sw.js` starts with `const SW_KILL = false;`. When true, it behaves like the React kill branch:
     `getRegistrations()` → `unregister()` each, and delete every cache.
   - The drill is ONE commit with three changes: copy the killswitch over `public/sw.js`, set
     `NEXT_PUBLIC_SW_KILL=1`, and flip `SW_KILL = true`.
   - Write the drill in the header comment of `scripts/pwa/sw-killswitch.js`. The flag is named `SW_KILL`
     (critic.md's `NEXT_PUBLIC_SW_ENABLED` is retired; 4D's runbook uses this name).
   - In the killswitch, `matchAll({ type: "window" })` WITHOUT `includeUncontrolled`. Each
     `client.navigate(client.url)` gets its own `.catch(() => {})`. `unregister()` and the cache
     deletes are the real work; the reload is a bonus.
   - The React kill branch runs on every hostname, not just www.

5. **1B — major — R14's "focus an existing window client and navigate() it" can pick the desktop messages iframe.**
   `clients.matchAll({type:"window"})` returns nested frames too (`Client.frameType === "nested"`,
   `research/web-nextjs-sw.factcheck.md:60`). The desktop `/messages` page iframes `/html/messages.html`,
   and that iframe is where students type, so it is often the most recently focused client. Navigating it
   to `/messages?channel=…` would load the whole React shell inside the iframe. Separately, `navigate()`
   rejects for uncontrolled clients, and `focus()` must be called while the click still counts as a user
   gesture.
   **RULING:**
   - `matchAll({ type: "window", includeUncontrolled: true })`, then keep only `frameType === "top-level"`.
   - Prefer a client whose URL already equals the target: just `focus()` it.
   - Otherwise take the first top-level client: `await client.focus()` FIRST, then `client.navigate(url)`.
   - If there's no client, or navigate throws or resolves `null`, call `clients.openWindow(url)`.

6. **1B — major — the plan is ambiguous about `/api` navigations. Exclude them.**
   R4 handles every same-origin GET navigation, but its parenthetical says "no /api". The research
   (`web-nextjs-sw.md:274`) and critic.md's 1B row exclude `/api`. Real navigations to `/api` exist: the
   `.ics` links at `src/app/campus/campus-home.tsx:8740` and `src/components/LeftNav.tsx:1442` return
   `Content-Disposition: attachment` (`src/app/api/events/[id]/ics/route.ts:77`). How iOS hands a SW-served
   `text/calendar` or attachment response to Calendar is unverified, and an offline page for a download is
   meaningless.
   **RULING:** the fetch handler returns without `respondWith` when `url.pathname.startsWith("/api/")`.
   `/auth/*` pages STAY handled: an installed student offline on `/auth/login` should get the branded page
   that reloads itself, not Safari's dead-end error.

7. **1B vs 1C — major — the checker will fail the offline page 1B is told to write.**
   1B must put an inline SVG logo in `offline.html`. Inline SVG carries `xmlns="http://www.w3.org/2000/svg"`
   (see `src/app/icon.svg:1`). 1C must fail on "any `http(s)://` URL to another origin in its body".
   **RULING:** the checker ignores `xmlns` / `xmlns:*` attribute values. It fails on any `src=`, `srcset=`,
   `<link href=`, CSS `url(` or `@import` in `offline.html`, same-origin included, because only
   `offline.html` itself is cached, so a same-origin image or font is broken exactly when the page is
   shown. `<a href>` is allowed. 1B, in `offline.html`:
   - `data:` URIs are fine; there are no other subresources.
   - A top comment says "edit this → bump `SW_VERSION` in public/sw.js". The cached copy only refreshes
     when sw.js changes.
   - "Try again" goes to `/campus` when `location.pathname === "/offline.html"`, else reloads. Someone who
     opened the file directly shouldn't loop.

8. **1A vs 1C — major — Next 16.3.4 doesn't emit `apple-mobile-web-app-capable`.**
   `appleWebApp.capable` renders `<meta name="mobile-web-app-capable">`
   (`node_modules/next/dist/lib/metadata/metadata.js:604–608`). It also renders
   `apple-mobile-web-app-title` (:610–614) and `apple-mobile-web-app-status-bar-style` (:632–636). A
   checker grepping for `apple-mobile-web-app-capable` goes red. Apple has always tied the status-bar-style
   tag to the capable tag, and whether iOS 26 still does is unverified.
   **RULING:**
   - 1A adds `other: { "apple-mobile-web-app-capable": "yes" }` next to `appleWebApp`. Both tags present
     is harmless, and Chrome's deprecation warning only fires when the new one is missing.
   - The checker requires on `/` all four:
     - `mobile-web-app-capable=yes`
     - `apple-mobile-web-app-capable=yes`
     - `apple-mobile-web-app-title=Vibe`
     - `apple-mobile-web-app-status-bar-style=default`
   - It matches the manifest link as `rel="manifest"` with an href that STARTS WITH `/manifest.webmanifest`.
   - 1A does NOT set `metadata.manifest`; the `manifest.ts` file convention links it.

9. **1E — major — `LegalLayout` is a server component; the hook can't go in it.**
   `src/components/legal/LegalLayout.tsx` has no `"use client"`. All four legal pages import it and export
   `metadata` (e.g. `src/app/legal/terms/page.tsx:10`). `useIsStandalone()` needs a client file, and 1E
   owns none here. Marking LegalLayout `"use client"` would turn LegalH2/P/UL into client components for
   no reason.
   **RULING:** 1E also owns a NEW file, `src/components/legal/LegalBackLink.tsx` (`"use client"`). It
   renders the existing "← Back to Vibe" link with its current inline style (LegalLayout.tsx:37–48):
   `href="/"` normally, `/campus` in standalone. LegalLayout stays a server component and renders
   `<LegalBackLink />`.

10. **1E — major — R16 is wrong for Android and removes working links.**
    An installed Android app (WebAPK) and desktop installed windows share the browser profile's cookies.
    A `target="_blank"` résumé link opens in a Chrome Custom Tab or tab that IS signed in. Only iOS gives
    the Home Screen app its own cookie jar. "Open" also covers EXTERNAL résumé links
    (`ResumeViewerMobile.tsx:241–244, 490`), which need no Vibe session. Hiding it would leave no way to
    reach them. And "email links open Safari" is false on Android, where a confirm link opens in Chrome
    or in the installed app.
    **RULING:**
    - Hide BOTH `target="_blank"` links, "Open" (:489–510) and "Open my original" (:533–548), only when
      `standalone && platform is ios-* && isResumeProxyPath(url)`. External links keep "Open" everywhere.
    - In the auth copy, lead with the code in any standalone. The "links open Safari" sentence is iOS-only.
    - `use-standalone.ts` also exports `usePlatform(): Platform | null` (null on the server and first
      render), so components don't parse the UA themselves. Wave 3 uses it.
    - The reset-email line goes in BOTH the HTML `notes` (raw HTML: `&mdash;` style, no bare `<`) and the
      `text` array (`resend-transactional.ts:159–170`), worded for every platform, e.g. "Using Vibe from
      your Home Screen? Open it there and sign in with your new password."
    - critic.md I7 becomes: "iOS standalone: hosted résumé shows no Open buttons, external link still
      opens; Android standalone: Open works."

11. **1E — minor — `(display-mode: fullscreen)` also matches desktop browser fullscreen.**
    In Chrome it matches for F11 and for the Fullscreen API, and Vibe has video posts. A pure
    `navigatorStandalone || matchStandalone || matchFullscreen` flips a desktop tab to "standalone" while
    a video plays full screen. `navigator.standalone` is a boolean only on iOS/iPadOS WebKit; everywhere
    else it's undefined.
    **RULING:**
    - `isStandalone = navigatorStandalone === true || matchStandalone || (matchFullscreen && typeof
      navigatorStandalone === "boolean")`.
    - The CSS rule (R17) keeps both queries; cream behind a fullscreen video is harmless.
    - `detectPlatform` precedence, pinned in the test:
      1. in-app markers (on iOS → `ios-in-app`)
      2. iOS: `iPhone|iPad|iPod`, or `Macintosh` + `maxTouchPoints > 1`
         - `CriOS|FxiOS|EdgiOS` → `ios-other-browser`, else `ios-safari`
      3. Android: `SamsungBrowser` before `Chrome` (Samsung's UA contains "Chrome")
      4. desktop Chromium (`Chrome|Chromium|Edg`, not `OPR` → `other`)
      5. `desktop-safari`
      6. `Firefox` → `firefox`
      7. `other`

12. **1A + 1C — minor — pin the manifest icon list so the checker and the generator agree.**
    **RULING:**
    - `icons` is exactly four entries, each `type: "image/png"` with explicit `sizes`:
      - `/icons/icon-192.png` and `/icons/icon-512.png`, `purpose: "any"`
      - `/icons/maskable-192.png` and `/icons/maskable-512.png`, `purpose: "maskable"`
    - `badge-mono-96.png` is NOT in the manifest; it's the wave-2 notification badge.
    - Each shortcut has `icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]`.
    - The checker asserts these exact srcs/purposes/sizes, fetches each with sharp, and checks that
      `maskable-*` has no transparent pixels (the full-bleed white rule in R2).

13. **1D — minor — the static pages already link the apple-touch-icon.**
    `public/html/profile.html:15`, `messages.html:11` and `onboarding.html:11` each already have
    `<link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180">`. The plan's list would add a
    second copy. The heads open at the top of each file; `</head>` is at 3052 / 944 / 434.
    **RULING:**
    - Insert exactly three lines directly after that existing line: the manifest link, `theme-color`,
      and `<script src="/html/_sw.js" defer></script>`. Add no apple-touch-icon.
    - Run eslint on `_sw.js` only; eslint has no config for `.html`. For each page, prove the edit with a
      grep count: exactly 1 of each new tag.

14. **1C — minor — R12's `Content-Type` override is redundant and a possible foot-gun.**
    Every response already carries `X-Content-Type-Options: nosniff` (`next.config.ts:48`), and the
    `public/html/_*.js` scripts load today, so public `.js` is already served with a JavaScript type. If a
    header rule doubled the value, `Headers.get` would join the two with ", ", and a SW script with a MIME
    type the browser can't read fails to register.
    **RULING:**
    - Drop the `Content-Type` entry. Keep only the `Cache-Control` rule for `/sw.js` and for `/offline.html`.
    - The checker asserts `content-type` has no comma and starts with `application/javascript` or
      `text/javascript` (case-insensitive).
    - It parses `Cache-Control` as a set of directives (`no-cache` and `no-store` present) instead of
      comparing the exact string.

15. **1B + 1D — minor — worker promise rejections will flood Sentry.**
    The Sentry client (`src/instrumentation-client.ts:5`) records unhandled rejections. `update()` rejects
    whenever the phone is offline, which is exactly when an installed app resumes. `register()` rejects in
    private modes and some in-app webviews.
    **RULING:**
    - Every `register` / `update` / `getRegistrations` / `unregister` / `caches.*` promise in the
      registrar and `_sw.js` ends in `.catch(() => {})`.
    - When the gate says "don't register" (not www and no `NEXT_PUBLIC_SW_DEV`), the registrar unregisters
      any leftover registration. A dev worker from an earlier `NEXT_PUBLIC_SW_DEV=1` session shouldn't
      linger on localhost:3000.

16. **1E — minor — standalone cream also reaches desktop installed windows.**
    Desktop Chrome matches `(display-mode: standalone)` in an installed window. R17 therefore turns the
    empty areas on desktop React pages cream too (`/admin`, `/settings`, `/auth/*`). Today those rely on the
    white from `@apply bg-background` (`src/app/globals.css:35–40`, layered in `@layer base` at :7).
    Cosmetic, not breaking.
    **RULING:**
    - Keep R17 as written. Put it UNLAYERED at the end of `globals.css`; unlayered beats `@layer base`
      whatever the order.
    - Add to the orchestrator's DEFERRED pass: install from `localhost:3000` in desktop Chrome, which makes
      a real standalone window. Look at `/`, `/the-map`, `/auth/login`, `/settings`, `/admin`,
      `/legal/terms` there, and at a phone-sized window.

17. **1A — minor — two plan steps agents can't satisfy.**
    - "Run the generator once and commit its outputs" (plan:42) clashes with the house rule of no git in
      agents.
    - 1A's `tsc` gate fails with TS2307 on `@/components/pwa/ServiceWorkerRegistrar` until 1B's file exists
      (the batches run side by side).

    **RULING:** 1A runs `node scripts/gen-pwa-icons.mjs`, leaves the five PNGs uncommitted, and prints
    their pixel sizes in its report. The orchestrator commits. 1A reports a TS2307 on that one import as
    "expected until 1B lands". Any other tsc error in `layout.tsx` is real. The orchestrator re-runs tsc
    for the whole wave after merge.

---

**Checked and fine (no ruling needed):**
- Next 16.3.4's `MetadataRoute.Manifest` has `id`, `launch_handler` (array form) and
  `purpose: "maskable"`, so no casts are needed.
- `src/app/icon.svg` art reaches 0.68 of the half-width, inside the maskable 0.8 safe zone.
- `apple-icon.png` and `icon.png` are fully opaque (alpha min 255).
- No existing CacheStorage, `serviceWorker` or `display-mode` code to collide with.
- The auth `/login` unconfirmed branch already leads with the code (`src/app/auth/login/page.tsx:338–343`).
- `ASSET_EXTENSIONS` already lets `/html/_sw.js` through the restriction gate.
