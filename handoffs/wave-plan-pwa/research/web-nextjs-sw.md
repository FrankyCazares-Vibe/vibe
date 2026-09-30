# Manifest + service worker on Next 16 / Vercel — research (2026-09-24)

Research pass for the installable-app wave. Read-only; nothing in the repo was changed.
Evidence: repo claims as `path:line`; web claims as URL + the date the page was published/updated.
Anything I could not confirm is marked **UNVERIFIED**.

---

## 0. The short version (plain English)

- **The manifest is easy.** Next.js has a built-in file for it (`src/app/manifest.ts`). Next serves it and
  adds the `<link>` tag to every React page on its own. The static pages in `public/html` need that tag added by hand.
- **Write the service worker by hand, as one small plain-JavaScript file at `public/sw.js`.** Vibe's service worker
  has three jobs: show push notifications, open the right page when one is tapped, and show a branded
  "you're offline" page. It should **not** cache anyone's feed, profile or messages. A 150-line file does
  all of that with no new packages and no build step, and any AI agent can read the whole thing at once.
- **Do not adopt Serwist's default settings.** Its standard caching recipe stores API responses, page HTML and
  even responses from other sites (like Supabase) on the phone. On a shared or borrowed phone, the next
  person could see the last person's data after sign-out. You could use Serwist with custom rules,
  but by then it adds a build dependency and saves Vibe nothing.
- **Plan the off switch before shipping.** A broken service worker can break the site for everyone who
  has it until it is replaced. The fix is to always keep it at the same address (`/sw.js`) and keep a
  ready "self-destruct" version in the repo that we can ship in one commit.
- **Sign-out must turn off push on that device.** Otherwise the next person to use the phone gets the
  previous person's notifications. This is the real privacy risk here, bigger than caching.
- **Testing:** Chrome on your Mac tests almost everything on `localhost`. iPhone push needs a real
  iPhone, HTTPS, and the app added to the Home Screen. Vercel preview links give HTTPS, but they use the
  **production database**, so treat a preview as production.

---

## 1. What the repo looks like today (facts)

| Fact | Evidence |
|---|---|
| Next **16.3.4**, React 19.2.4 | `node -e ...next/package.json` → `16.3.4`; `package.json:29,31` |
| `next build` = **Turbopack** (no `--webpack` flag) | `package.json:7` (`"build": "next build"`); Next CLI docs: `--turbopack` "(enabled by default)", `--webpack` "Build using Webpack" — `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md:100-101` |
| No manifest, no service worker | `ls src/app public`; live GET `https://www.connectvibe.app/manifest.webmanifest` → 404, `/sw.js` → 404 (2026-09-24) |
| Icons: only **192×192** (`src/app/icon.png`), 180×180 apple icon, 48px favicon, SVG | `file`/`sips` on the files; `src/app/layout.tsx:14-23`. **No 512×512 PNG and no maskable icon** (Chrome wants both for a good install) |
| `viewport.themeColor "#FAF7F2"`, `viewportFit "cover"` | `src/app/layout.tsx:27-32` |
| Proxy runs on **every** non-image path, incl. `.js` and `.webmanifest` | `src/proxy.ts:314-318` matcher skips only `_next/static`, `_next/image`, `favicon.ico`, svg/png/jpg/jpeg/gif/webp |
| Proxy calls `updateSession` (a GoTrue round-trip) **before** any check | `src/proxy.ts:219` |
| `.js`/`.webmanifest` are exempt from the restriction redirect, **`.html` is not** | `src/proxy.ts:85-116` (`ASSET_EXTENSIONS`, `isFileRequest`), `src/proxy.ts:242` |
| Global headers: HSTS, nosniff, `X-Frame-Options: SAMEORIGIN`, no CSP | `next.config.ts:41-70` |
| Static pages load unversioned helper scripts (`/html/_persistence.js` etc.) | `public/html/profile.html:18-31`, `public/html/messages.html:14-20` |
| Static pages set their own icon links (no manifest link, no theme-color) | `public/html/onboarding.html:6-11`, `public/html/messages.html:6-9` |
| Same-origin iframes: desktop messages shell, desktop onboarding shell | `src/app/messages/MessagesSwitch.tsx:42-48`, `src/app/onboarding/OnboardingSwitch.tsx:100-101` |
| Desktop profile is a **top-level** load of `/html/profile.html?app=1` | `src/app/profile/profile-html-bridge.tsx:34` |
| Sign-out happens in ≥5 places (plus account deletion) | `src/components/settings/SettingsClient.tsx:1175`, `src/app/auth/terms/accept-terms-form.tsx:66`, `src/app/account/suspended/suspended-actions.tsx:54`, `src/app/auth/verify-school/page.tsx:235`, `src/components/auth/EmailLinkProblem.tsx:75`, `src/app/api/me/route.ts:151` |
| No test runner, no CI workflows | `package.json` scripts; no `.github/workflows` |

Live headers observed with plain GETs on 2026-09-24:

- `/_next/static/immutable/chunks/…js` → `cache-control: public,max-age=31536000,immutable`. Next 16.3 now puts
  hashed build files under **`/_next/static/immutable/`** (see the Vercel changelog in §9).
- `/html/_persistence.js` and `/icon.png` → `cache-control: public, max-age=0, must-revalidate`. So a plain
  `public/sw.js` would already get headers that are safe for a service worker, even with no config.
- `/` → `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` (dynamic page).
- No `dpl=` deployment ID shows up in the landing HTML. Whether Skew Protection is on for this project is
  **UNVERIFIED** (see §4.4).

---

## 2. (a) `app/manifest.ts` vs `public/manifest.webmanifest`

**Plain English:** use `src/app/manifest.ts`. Next writes the file, serves it at `/manifest.webmanifest`,
and puts the link tag on every React page for us. TypeScript checks the fields. The only extra work is one
`<link>` line in each of the three static HTML pages.

**How it works in 16.3.4 (checked in the installed package):**

- File convention: `manifest.(json|webmanifest)` static, or `manifest.(js|ts)` generated, in the **root of `app`**.
  A generated `manifest.ts` "is a special Route Handler that is cached by default" (built once, served as a static file)
  unless it uses request-time APIs. — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`;
  online copy https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest (docs v16.3.6).
- Served URL: a `.ts`/`.js` manifest is served as **`/manifest.webmanifest`** — `node_modules/next/dist/build/webpack/loaders/metadata/discover.js:58-71`.
- Auto link tag: Next emits `<link rel="manifest" href=...>` and adds `crossOrigin="use-credentials"` **only when
  `VERCEL_ENV === 'preview'`**, so the manifest loads through Vercel Deployment Protection on preview URLs —
  `node_modules/next/dist/lib/metadata/metadata.js:290-297`. Copy that behavior by hand in the static pages if previews are protected.
- Type: `MetadataRoute.Manifest` supports `id, name, short_name, description, start_url, scope, display,
  display_override, orientation, background_color, theme_color, icons, screenshots, shortcuts, share_target,
  launch_handler, categories, lang, dir, protocol_handlers, file_handlers …` — `node_modules/next/dist/lib/metadata/types/manifest-types.d.ts`.

**Why not `public/manifest.webmanifest`:** it works, but nothing links it automatically, it has no type
checking, and Next's metadata system won't know about it. The only real advantage is that a static file is
simpler for the static pages to share. They can link to `/manifest.webmanifest` either way, so that advantage doesn't count here.

**Vibe-specific notes:**

- `/manifest.webmanifest` goes through `src/proxy.ts` today: `updateSession` runs (`src/proxy.ts:219`), but it is not
  redirected, because `webmanifest` is in `ASSET_EXTENSIONS` (`src/proxy.ts:94-98`). Cheaper and cleaner: add it to the matcher's
  skip list (§8).
- Add `<link rel="manifest" href="/manifest.webmanifest">` plus `<meta name="theme-color" content="#FAF7F2">` to
  `public/html/{profile,messages,onboarding}.html` next to their existing icon links (`public/html/messages.html:6-9`).
- Icons: Chrome's docs recommend `icons` (ideally maskable) along with `name`/`short_name`, `start_url` and `display`. In practice
  that means a **192 and a 512 PNG** plus a maskable variant. The repo has only 192 (`src/app/icon.png`). Needs a 512 and a maskable asset.
  Source: https://developer.chrome.com/blog/update-install-criteria (published 2023-12-05).
- The manifest's content (`start_url`, `id`, `scope`, `display`, iOS meta) is covered by the sibling research files. This file only covers how it is served.

---

## 3. (b) Hand-written `public/sw.js` vs Next's new built-in SW bundling vs Serwist vs Workbox

**Plain English:** four ways to get a service worker. For Vibe the winner is the simplest one: a hand-written
`public/sw.js`. Here is why.

### 3.1 Option A: hand-written `public/sw.js` (recommended)

- Plain JS file served as-is at `/sw.js`. Its default scope is `/` because it sits at the root, so no special header is needed.
  MDN: the maximum scope is the script's directory unless `Service-Worker-Allowed` widens it —
  https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register (modified 2026-06-10).
- Vercel already serves `public/` files with `public, max-age=0, must-revalidate` (observed on `/html/_persistence.js`, 2026-09-24).
- **The same URL works from the React app and from `public/html/*.html`.** Neither needs a bundler.
- No new dependencies, no build step, and no coupling to Turbopack internals.
- Cost: no TypeScript and no generated precache list. Vibe wants **neither**. We should not precache the app,
  because the phone must never serve an old copy of a signed-in page.
- For AI maintainers: one file, about 150 lines, one rule ("bump `SW_VERSION` when you edit it").

### 3.2 Option B: Next 16.3's own Turbopack SW bundling (new, July 2026)

- Next 16.3 now compiles `navigator.serviceWorker.register(new URL('../lib/sw.ts', import.meta.url), {scope:'/'})`.
  The official PWA guide switched to this syntax — https://nextjs.org/docs/app/guides/progressive-web-apps
  (lastUpdated 2026-07-30, docs v16.3.6); same text in `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md:158-165`.
- Output: one worker per scope at a **fixed, non-hashed URL**, `/_next/static/service-worker/sw.js` for scope `/`.
  It is served with `Service-Worker-Allowed: /` and `Cache-Control: public, max-age=0, must-revalidate` —
  `node_modules/next/dist/esm/build/index.js:1589-1605`, `node_modules/next/dist/esm/server/lib/router-server.js:379-383`;
  PRs vercel/next.js#94921 (2026-06-25, `service_worker_chunk_filename`: scope `/` → `sw.js`), #94923, #95554 (2026-07-09, "Output service workers to `/_next/static/`").
  The e2e test asserts no `immutable`, `max-age=0`, an ETag, and `Service-Worker-Allowed` —
  `test/e2e/app-dir/service-worker/service-worker-register.test.ts` on vercel/next.js canary (last touched 2026-09-10).
- The installed binary has it: `node_modules/@next/swc-darwin-arm64/next-swc.darwin-arm64.node` contains `static/service-worker` (16.3.4).
- **Why not for Vibe (yet):**
  1. It is **Turbopack-only** and about 3 months old. Deploy tests were switched off on 2026-07-07 (#95570) and put back after #95554.
     Whether Vercel keeps that URL **mutable** in production, given Vercel's July 2026 "reuse static files across
     deployments" change, is **UNVERIFIED**. Check it with `curl -I` on a preview before relying on it.
  2. The URL is **framework-internal**. If a future Next release moves it, browsers holding the old worker keep
     checking the old URL, get 404, and **keep the old worker**. That is the "never change the SW URL" trap
     (https://web.dev/articles/service-worker-lifecycle, 2016-09-29; https://developer.chrome.com/docs/workbox/remove-buggy-service-workers, updated 2021-10-20).
  3. The static pages can't use `import.meta.url`. They would have to hard-code `/_next/static/service-worker/sw.js`.
- Good to know: if Vibe ever wants TypeScript in the worker, this is now the zero-dependency way. Nothing else in the repo needs it today.

### 3.3 Option C: Serwist

- Two packages, both at **9.5.12** (npm, modified 2026-07-22); 10.0.0 is still `preview.14` (`npm view`, 2026-09-24).
  - `@serwist/next`: a webpack plugin. On Next 16 it needs `next build --webpack`. LogRocket (2026-01-14):
    "Next.js 16 uses Turbopack by default, but Serwist requires Webpack" — https://blog.logrocket.com/nextjs-16-pwa-offline-support/.
    Switching Vibe's whole production build to webpack just for the SW is a bad trade.
  - `@serwist/turbopack`: works with Turbopack. It is **not** a bundler plugin. It is a Route Handler at `app/serwist/[path]/route.ts`
    that bundles `app/sw.ts` with **esbuild** at build time (`force-static`). The worker is served at `/serwist/sw.js` with
    `Service-Worker-Allowed: /`, and a `<SerwistProvider swUrl="/serwist/sw.js">` handles registration. `withSerwist()` adds `esbuild` to
    `serverExternalPackages` — https://serwist.pages.dev/docs/next/turbo; source `packages/turbo/src/index.ts` in serwist/serwist (main, read 2026-09-24).
    Its source comment says it is a "Workaround for Next.js + Turbopack, while plugins are still not supported … for when NOT using `cacheComponents`".
    The example derives its revision from `git rev-parse HEAD`. On Vercel use `VERCEL_GIT_COMMIT_SHA` instead (whether `.git` is present in Vercel builds is UNVERIFIED).
- **The danger for Vibe is `defaultCache`,** which every example uses. In production it runs **NetworkFirst and caches**:
  same-origin `/api/*` GETs (cache `apis`), RSC payloads (`pages-rsc`), HTML pages (`pages`), every other same-origin
  path (`others`), and **all cross-origin requests** (`cross-origin`, which would include Supabase REST and signed storage URLs). It also runs
  StaleWhileRevalidate on every `.js`/`.css`, which would serve a stale `/html/_persistence.js` for one load after each deploy —
  `packages/turbo/src/index.worker.ts` (serwist/serwist main, read 2026-09-24). For an app with private per-user data,
  that is unsafe on a shared device and breaks "counts public / identities private".
- Verdict: usable only with a hand-written `runtimeCaching` list. By then it gives Vibe nothing that option A lacks, and it adds
  `serwist`, `@serwist/turbopack`, `esbuild`, a route and a provider.

### 3.4 Option D: Workbox directly

- Alive: v7.4.1 released 2026-05-05 (GitHub releases API); Chrome's Aurora team owns it (GoogleChrome/workbox issue #3149).
- There is no Next/Turbopack integration. `next-pwa` (webpack) is the old path. You would run `workbox-build injectManifest` as a
  post-build step, or copy Workbox modules into `public/`. That is more moving parts than option A, for features (precaching, routing DSL) Vibe shouldn't use.

---

## 4. (c) A safe update lifecycle

**Plain English:** the browser checks `/sw.js` for changes whenever someone opens a Vibe page. If the file's
bytes changed, it installs the new version. Keep the worker "dumb": no cached pages, just push and an offline screen.
Then a new version can take over at once, silently, with no "please reload" nag, because there is no old
data it could clash with. Reminding people to reload the **app** after a deploy is a separate, small feature (§4.4).

### 4.1 Headers for `/sw.js`

| Header | Value | Why / evidence |
|---|---|---|
| `Cache-Control` | `no-cache` (or `public, max-age=0, must-revalidate`, which Vercel already sends for `public/`) | Next's PWA guide uses `no-cache, no-store, must-revalidate` — https://nextjs.org/docs/app/guides/progressive-web-apps (2026-07-30). Plain `no-cache` still allows cheap 304s via ETag, and Next's own built-in SW uses `max-age=0, must-revalidate` + ETag (`router-server.js:381`). Either is fine. Browsers also skip the HTTP cache for the main SW script on update checks (Chrome 68+) — https://web.dev/articles/service-worker-lifecycle (2016-09-29) |
| `Content-Type` | `application/javascript; charset=utf-8` | Vercel already sends it for `public/*.js` (observed `/html/_persistence.js`, 2026-09-24). Browsers refuse to register a SW served with a non-JS MIME type |
| `Service-Worker-Allowed` | **not needed** | Only needed when the script lives *below* the scope it claims (MDN register(), 2026-06-10). `/sw.js` at the root already covers `/` |
| `Content-Security-Policy` | optional `default-src 'self'` on `/sw.js` only | Next's guide suggests it. **Gotcha:** a SW's CSP governs the SW's own `fetch()`. If the worker ever calls `fetch(event.request)` for a Supabase/Stripe URL, `connect-src 'self'` blocks it. Rule: the SW never calls `respondWith` for cross-origin requests |
| **no `Set-Cookie`** | skip the proxy for `/sw.js` | Today the matcher sends `.js` through `updateSession` (`src/proxy.ts:219,314-318`), which may refresh cookies on the script response. Harmless but wasteful: every update check costs a GoTrue round-trip |

Register with `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })`.
`updateViaCache: 'none'` also sends any `importScripts()` past the HTTP cache (the default, `'imports'`, lets them use it).
The Next guide uses `'none'` too.

### 4.2 `skipWaiting()` / `clients.claim()`

- The risk: a page loaded under worker v1 gets its later requests handled by v2 —
  https://web.dev/articles/service-worker-lifecycle (2016-09-29); Chrome's Workbox docs advise a prompt instead of blanket
  `skipWaiting` because "lazily-loaded subresources" can break — https://developer.chrome.com/docs/workbox/service-worker-lifecycle (updated 2021-09-24).
- **Why it's safe for Vibe:** that risk only exists when the two versions answer the same request *differently*, which in
  practice means different caches. If both versions just pass requests to the network, apart from the offline
  fallback and push, a mid-session swap changes nothing the page can see. So: **`skipWaiting()` in `install`,
  `clients.claim()` in `activate`, silent updates, no "new version" prompt for the SW.** Serwist's own example does the
  same (`skipWaiting: true, clientsClaim: true`, `examples/next-turbo-basic/app/sw.ts`).
- If a future version adds real caching, switch to the prompt pattern: the waiting worker gets `postMessage({type:'SKIP_WAITING'})`
  from a "New version — reload" toast, and the page reloads once on `controllerchange` (Chrome doc above).

### 4.3 Navigation preload

- What it does: starts the page's network request **in parallel** with booting the SW, so a network-first
  navigation isn't slowed down by SW start-up. Turn it on in `activate` with `self.registration.navigationPreload.enable()` and read
  `await event.preloadResponse` in `fetch`. Supported in Chrome 59+, Edge 18+, Firefox 99+, **Safari 15.4+** —
  https://web.dev/blog/navigation-preload (updated 2017-02-15).
- Preload requests carry `Service-Worker-Navigation-Preload: true`. The article says to add `Vary` on it **if the response
  is cacheable**. Vibe's dynamic pages are already `private, no-store` (observed on `/`), so nothing to do.
- Pattern: `respondWith((async () => { try { return (await event.preloadResponse) || await fetch(event.request); } catch { return (await caches.match('/offline.html')) || Response.error(); } })())`.
- Alternative: **no `fetch` handler at all**, meaning push only. Zero navigation cost and zero caching risk, but no branded offline
  page. Chrome no longer needs a fetch handler for menu install (108 mobile / 112 desktop), though the automatic install
  *prompt* still did as of the post — https://developer.chrome.com/blog/update-install-criteria (2023-12-05).
  Whether that prompt rule has since changed is **UNVERIFIED**. It doesn't matter on iOS, which has no install prompt.

### 4.4 Version skew with Vercel deploys

- **Skew Protection** pins framework-managed requests (JS/CSS, client navigations, prefetches, Server Actions) to the deployment
  that served the page. It does **not** pin full-page (document) navigations. It is available to **Pro and Enterprise** teams, is on by default for projects
  created after 2024-11-19, and keeps deployments reachable for a default max age of 1 day —
  https://vercel.com/docs/skew-protection (last_updated 2026-09-16). **UNVERIFIED for Vibe:** the plan tier and whether
  it is on. Check Vercel → Settings → Advanced → Skew Protection. No `dpl=` appears in the live HTML.
- Separately, since 2026-07-17 Vercel **reuses content-addressed static files across deployments** ("Next.js 16.3 preview and later
  already have it enabled") — https://vercel.com/changelog/optimized-cdn-caching-and-deploying-of-immutable-static-assets.
  So old hashed chunks tend to stay fetchable after a deploy. How long they stay is not stated (**UNVERIFIED**).
- **What the SW changes about skew:** nothing, *if* it never serves cached HTML or RSC. A SW that caches pages is the classic way to
  end up running week-old HTML against new APIs. That's another reason for network-only navigations.
- **The installed-app gap:** a Home Screen app can stay in memory for days without a full reload. It then runs old JS against
  new `/api` routes, and Skew Protection does not pin custom `fetch()` calls (Vercel docs above). Cheap fix: a `force-static`
  `/api/version` route that returns `VERCEL_GIT_COMMIT_SHA` (a Vercel system env var). The client checks it on `visibilitychange` → visible
  and shows a "New version — tap to refresh" toast. MakerKit's guide (2026-02-03) describes the same version-endpoint + prompt
  pattern — https://makerkit.dev/blog/tutorials/force-update-nextjs. The static pages would need their own check (or skip it; they're desktop).

### 4.5 Kill switch (ship this plan **with** v1)

**Plain English:** if a bad worker ships, we replace `/sw.js` with a version that deletes itself. Browsers pick that up the
next time anyone opens Vibe. This only works if the address never changes, so `/sw.js` is permanent.

1. **Never rename or move `/sw.js`.** If the URL changes, the old worker keeps running forever alongside the new one —
   https://developer.chrome.com/docs/workbox/remove-buggy-service-workers (updated 2021-10-20). Changing the URL is also why option B's framework-internal URL is risky (§3.2).
2. **Why it works even when the bad worker breaks every page:** the browser fetches the worker script itself for update checks, and
   those fetches **don't go through** the worker's `fetch` handler. A byte-different `/sw.js` gets installed on the next
   navigation, or on a push event if the last check was more than 24 hours ago (web.dev lifecycle, above).
3. **Keep a ready kill file in the repo**, e.g. `public/sw-killswitch.js.txt` or a documented snippet in `docs/`. The emergency commit copies it over
   `public/sw.js`. Content, per Chrome's guide and adapted: `install` → `skipWaiting()`; `activate` → delete every
   `caches.keys()`, `self.registration.unregister()`, then `clients.matchAll({type:'window'})` → `client.navigate(client.url)`.
   **No `fetch` handler.** Keep the `push` handler out, so any leftover pushes do nothing.
4. **Client-side switch:** `NEXT_PUBLIC_SW_ENABLED=0` makes the React registrar run
   `getRegistrations().then(rs => rs.forEach(r => r.unregister()))` instead of registering. Belt and braces; it needs a deploy either way.
5. **Instant Rollback** on Vercel also works as a kill switch: rolling back restores the previous `/sw.js` bytes, and browsers see a
   byte change and reinstall it. This helps only if the previous worker was good. (Rollback limits per plan are **UNVERIFIED**.)
6. **Nuclear option, never on normal sign-out:** a response header `Clear-Site-Data: "storage"` unregisters service workers
   and clears CacheStorage, but **also wipes localStorage/IndexedDB**, which the static pages' `_persistence.js` relies on.
   Supported in Chrome 61+, Safari 17+, Firefox 63+ (MDN browser-compat-data, read 2026-09-24; MDN page modified 2025-11-21 —
   https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data).

---

## 5. (d) Caching that is safe with signed-in content

**Plain English:** the worker keeps exactly one thing on the phone, the "you're offline" page. Everything else
(pages, API calls, Supabase, images) goes to the network as if the worker weren't there. Signing out also turns off push
for that device.

### 5.1 Rules, in order

| Request | Strategy | Why |
|---|---|---|
| Cross-origin (Supabase, Stripe, Google Fonts, S3/R2) | **don't touch**: no `respondWith` | Avoids caching private Supabase responses and signed URLs, and the SW-CSP gotcha (§4.1) |
| Non-GET (POST/PATCH/DELETE) | don't touch | Never cache writes |
| `/api/*`, `/auth/*` | don't touch | Private and per-user. Serwist itself special-cases `/api/auth/*` as NetworkOnly for the same reason (`index.worker.ts`) |
| Navigations (`request.mode === 'navigate'`, same-origin, not `/api`/`/auth`) | **network-only** + navigation preload; offline page **only if the network throws** | Nobody sees a stale signed-in page; a working network always wins |
| `/_next/static/immutable/*` | v1: don't touch (the HTTP cache already holds them for a year, observed). v2 option: cache-first | The URL *is* the content hash, so cache-first can't serve the wrong version. **Never** apply this to `/_next/static/service-worker/*` (mutable, §3.2) or `/html/_*.js` (unversioned) |
| Everything else | don't touch | Default to network |

### 5.2 Why "never cache responses with `Set-Cookie`" can't be a runtime check

- `Set-Cookie` is a **forbidden response header name**. JavaScript, including a SW reading a `fetch()` response, never sees it —
  https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_response_header_name (modified 2025-07-11).
- So the rule has to be an **allow-list of URL patterns known to be public and content-hashed**, not header sniffing. A SW *can*
  read `Cache-Control` and `Vary`. Any future cache helper should still refuse `no-store`, `private`, or `Vary: Cookie`/`*` as a second line of defense.

### 5.3 Offline fallback page

- `public/offline.html`: fully self-contained (inline CSS, system fonts, inline SVG logo, no scripts that need the network).
  It is precached in `install` with `cache.add(new Request('/offline.html', { cache: 'reload' }))`, in a cache named with `SW_VERSION`.
- **Proxy gotcha:** `.html` is *not* in `ASSET_EXTENSIONS` (`src/proxy.ts:94-98`). For a suspended or banned user, the restriction gate
  (`src/proxy.ts:235-245`) would **redirect `/offline.html` to the suspended notice**. The worker would then precache the notice, or a
  redirected response, which Chrome refuses to use for a navigation. **Fix: add `offline\\.html`, `sw\\.js` and
  `manifest\\.webmanifest` to the matcher's skip list at `src/proxy.ts:316`.** None of the three holds user data.
- Its message must be neutral ("You're offline. Vibe will reload when you're back.") and show no names, because it is shown to whoever holds the phone.
  Add an `online` listener that calls `location.reload()`.
- For in-app soft navigations there is also Next's experimental `useOffline` hook (`experimental.useOffline`). It keeps failed
  client navigations and Server Actions pending and retries them when the network returns. That's UI polish, separate from the SW —
  `node_modules/next/dist/docs/01-app/02-guides/offline-support.md` ("version: experimental"). Not required for v1.

### 5.4 Sign-out purge

- With the rules above, the SW caches nothing user-specific, so a cache purge is a precaution, not the main defense.
- **What actually matters is push:** on sign-out the device must (1) `registration.pushManager.getSubscription()` →
  `unsubscribe()`, and (2) the server must delete that endpoint's row. Otherwise the next person on that phone gets the previous
  student's notifications. There are ≥5 client sign-out paths plus account deletion (§1 table), so put this in **one helper**
  (e.g. `src/lib/pwa/sign-out-device.ts`) and call it from every path. Better still, also delete by `user_id + endpoint` on the server inside
  `POST /api/auth/logout` (`src/app/api/auth/logout/route.ts:12`), so a path that forgets the helper still loses server-side delivery.
- Optional: the SW listens for `message` `{type:'SIGNED_OUT'}` → `caches.keys()` → delete everything except the offline cache.
- Optional: `Clear-Site-Data: "cache"` on the logout response clears the **HTTP** cache (Chrome 127+, Safari 17+, Firefox 138+ per MDN BCD).
  It does **not** clear CacheStorage or unregister the SW. Don't use `"storage"` here (§4.5.6).

---

## 6. (e) Registering from the React app and from the static pages

**Plain English:** one worker covers the whole site. Registering it from the main app is enough, and the static pages can
register the same file with a one-line script so desktop visitors get it too. Framed pages are covered automatically.

- **React:** a `'use client'` component (e.g. `src/components/pwa/ServiceWorkerRegistrar.tsx`) mounted once in `src/app/layout.tsx`
  next to `<ToastHost />` (`src/app/layout.tsx:51-54`). It registers `/sw.js` after `load`, checks
  `'serviceWorker' in navigator && window.isSecureContext`, and **skips in dev** (`process.env.NODE_ENV !== 'production'`) unless
  `NEXT_PUBLIC_SW_DEV=1`. It reads the kill flag from §4.5.4.
- **Static pages:** `public/html/_sw.js` (about 15 lines, same logic, no env access), included with `<script src="/html/_sw.js" defer>` in
  `profile.html`, `messages.html` and `onboarding.html`. Calling `register()` again with the same URL is a no-op, so a double
  registration from the React parent plus the framed page is harmless.
- **Scope:** `/sw.js` → scope `/` covers `/html/*`, `/campus`, `/messages`, everything. One worker per origin. Don't register a second
  worker at a sub-scope. (Related: if anyone later uses option B, Next 16.3 fails the build with "Multiple service workers with
  different source files" for one scope — vercel/next.js `test/e2e/app-dir/service-worker-multiple`. That check does not apply to `public/sw.js`.)
- **Iframes:** a same-origin iframe whose URL is in scope is its own SW **client** and is controlled. Its load reaches the worker's
  `fetch` handler as `mode: 'navigate'`, `destination: 'iframe'`. (The spec's `Client.frameType` exposes `"nested"` for these —
  https://developer.mozilla.org/en-US/docs/Web/API/Client/frameType.) Consequences:
  - The offline fallback will also show *inside* the messages/onboarding iframe when the network drops. That's fine, but keep
    `offline.html` layout-neutral (no full-screen chrome that looks odd in a frame).
  - The resume preview iframes `/api/resume/...` → excluded by the `/api/*` rule, so the PDF streams straight from the network.
  - `X-Frame-Options: SAMEORIGIN` (`next.config.ts:57-66`) doesn't interact with the SW. Do **not** copy the Next guide's `DENY`
    example (it would re-break the S51 iframes).
- **Dev hygiene:** a worker registered on `http://localhost:3000` survives across projects on the same port. Unregister it
  (DevTools → Application → Service Workers → Unregister) when switching repos.
- **Update nudges:** on `visibilitychange` → visible, call `registration.update()` at most about once an hour, so a long-lived
  Home Screen app picks up a kill switch quickly.

---

## 7. (f) Testing

**Plain English:** most of this can be tested in Chrome on the Mac against `localhost`, with no phone and no
production writes. iPhone install and iPhone push need a real iPhone over HTTPS. The easiest HTTPS is a Vercel
deploy, but those use the production database, so test only with your own accounts.

### 7.1 Local (Mac, Chrome)

- `http://localhost` counts as a **secure context**, so service workers and the Push API work without HTTPS. LAN IPs like
  `http://192.168.x.x` do **not** count — https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts (modified 2026-09-14).
  A phone on the same Wi-Fi therefore can't test the SW over plain HTTP.
- Test with `next build && next start`, not `next dev`. The bundled offline guide says "Dev mode is not a reliable reference for offline
  behavior" (`offline-support.md`, Testing section), and the registrar skips dev by default (§6).
- Next's guide suggests `next dev --experimental-https` (self-signed cert) for local notification testing — flag documented in
  `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md:72-75`.
- **Chrome DevTools → Application** — https://developer.chrome.com/docs/devtools/progressive-web-apps (Chrome for Developers):
  the *Manifest* pane shows installability errors, icons and maskable safe areas. The *Service Workers* pane has "Update on reload",
  "Bypass for network", **Push** (fires a `push` event with a test payload, so the handler can be tested with no push server), Update, Unregister.
  *Storage → Clear site data* resets everything. Also `chrome://serviceworker-internals`. Network → Offline tests the fallback page.
- End-to-end push locally: subscribe on `localhost` (Chrome gives an FCM endpoint), then send with the `web-push` library from a
  Node script using the VAPID keys (Next guide, steps 3–4). The push service is remote, so this works from localhost. Use a
  local test user; the send script must not read or write the production `push_subscriptions` table.

### 7.2 iPhone

- Web Push on iOS/iPadOS 16.4+ works **only for Home Screen web apps** (manifest `display: standalone|fullscreen`). Permission must come from
  a user tap — https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (2023-02-16). Needs HTTPS.
- **Home Screen apps don't share cookies/storage with Safari** (long-standing, WebKit bug 181849 "Add to homescreen apps don't share
  storage with Safari" — https://bugs.webkit.org/show_bug.cgi?id=181849; still true in Sept 2026? **UNVERIFIED**, confirm on device).
  Test plan implication: after installing, sign in **inside** the installed app. A magic link from email opens Safari, not the
  app, which matters for the auth researcher.
- HTTPS options for a real iPhone:
  1. **Vercel preview URL**: real HTTPS, but **Preview uses the production database here**. Treat every tap as a production write and
     use only founder accounts. If Deployment Protection is on for previews, the phone needs a Vercel login first (**UNVERIFIED** for this project).
  2. **Ship behind the flag to production** and test on your own phone. This matches the existing "test mobile via Vercel deploy" habit.
  3. An HTTPS tunnel (cloudflared/ngrok) to local `next start`: still the prod database if `.env.local` points there (**UNVERIFIED**).
  4. iOS Simulator (Xcode) can add to Home Screen and run the SW. **Web push inside the Simulator is UNVERIFIED.** Use a real device for push sign-off.
- Safari Web Inspector (Mac Safari → Develop → [iPhone] → the Home Screen app) inspects the installed app's SW and console.

### 7.3 Automated checks an agent can run (no test runner in the repo today)

- **Lighthouse can't do it any more:** Lighthouse 12 (2024-04-22) **removed the PWA category** (GitHub release notes for GoogleChrome/lighthouse v12.0.0).
- `scripts/check-pwa.mjs` (plain Node, run against `next start` on localhost):
  1. `GET /manifest.webmanifest` → 200, JSON parses; `name`, `short_name`, `id`, `start_url`, `scope`, `display`, `theme_color`,
     `background_color` present. Icons include `192x192` and `512x512` PNGs and one `purpose: "maskable"`. Each icon URL returns 200
     `image/png`, and its real pixel size matches `sizes` (use `sharp`, already a dependency, `package.json:36`).
  2. `GET /sw.js` → 200, `content-type` contains `javascript`, `cache-control` contains `no-cache` or `max-age=0`, **no `set-cookie`**
     (proves the proxy skip works). `node --check public/sw.js` for syntax.
  3. `GET /offline.html` → 200 with **no redirect** and no `set-cookie`.
  4. Grep guard: `public/sw.js` has no `caches.put` outside the offline-cache block, no `/api` caching, and has a `SW_VERSION` line.
- Browser check with the headless browser (gstack `browse`, or Playwright if added): load `/`, then evaluate
  `await navigator.serviceWorker.ready` → `scope === origin + '/'`. Reload, then assert `navigator.serviceWorker.controller.scriptURL`
  ends with `/sw.js`. Chrome DevTools Protocol has `Page.getAppManifest` (stable, returns parse `errors`) and
  `Page.getInstallabilityErrors` (**experimental**) — `browser_protocol.json` in ChromeDevTools/devtools-protocol (read 2026-09-24).
  An empty installability-errors array means Chrome considers the page installable.
- Kill-switch drill (local): build with the real SW, load, then swap in the kill file, rebuild, reload twice. Assert
  `(await navigator.serviceWorker.getRegistrations()).length === 0` and `(await caches.keys()).length === 0`.

---

## 8. Recommendation for Vibe

**Plain English:** built-in manifest file, a hand-written worker at `/sw.js` that caches only the offline page, a kill
switch in the repo from day one, push turned off on sign-out, and a small check script. No new packages for the
service worker itself. (Push sending will need `web-push` on the server; that's the push researcher's call.)

**Decisions**

1. Manifest: `src/app/manifest.ts` (served at `/manifest.webmanifest`, auto-linked on React pages). Add the link by hand to the 3 static pages.
2. Service worker: **option A**, `public/sw.js`, plain JS, `SW_VERSION` constant at the top, stable URL forever.
3. Worker behavior v1: `install` (precache `/offline.html`, `skipWaiting`), `activate` (delete caches not matching `SW_VERSION`,
   `navigationPreload.enable()`, `clients.claim()`), `fetch` (same-origin GET navigations outside `/api`/`/auth` → preload/network,
   offline page on network error; **everything else untouched**), `push`, `notificationclick` (focus an existing client or open the URL
   from the payload, same-origin only), `message` (`SIGNED_OUT` → purge non-offline caches).
4. Silent updates (`skipWaiting` + `clients.claim`). The *app* gets a "New version — tap to refresh" toast via `/api/version` on visibility change.
5. Proxy: add `sw\\.js|offline\\.html|manifest\\.webmanifest` to the negative lookahead at `src/proxy.ts:316`.
   (This is a gate file, so follow the proxy memory: verify with an anonymous `curl` on localhost that those three return 200 with no redirect and no `set-cookie`.)
6. `next.config.ts` headers: add a `/sw.js` entry with `Cache-Control: no-cache` and `Content-Type: application/javascript; charset=utf-8`.
   Keep `X-Frame-Options: SAMEORIGIN`.
7. Registration: React registrar in the root layout plus `public/html/_sw.js` for the static pages. Production only. Kill flag `NEXT_PUBLIC_SW_ENABLED`.
8. Sign-out: one `signOutDevice()` helper (push unsubscribe + SW `SIGNED_OUT` message) called from every sign-out path, **plus** a
   server-side delete of the user's device subscription inside `/api/auth/logout`.
9. Revisit later, not v1: cache-first for `/_next/static/immutable/*`; Next's built-in TS worker bundling (option B) once it has a few
   releases behind it and a confirmed-mutable URL on Vercel; `experimental.useOffline` UI.

**Skeleton file list** (new unless marked)

| File | Purpose | Size |
|---|---|---|
| `src/app/manifest.ts` | `MetadataRoute.Manifest` (id, name, short_name, start_url, scope, display, colors, icons incl. 512 + maskable) | ~40 lines |
| `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png` (+ maybe `icon-maskable-192.png`) | missing install icons | assets |
| `public/sw.js` | the worker (§8.3) | ~150 lines |
| `public/offline.html` | self-contained offline page, reloads on `online` | ~60 lines |
| `public/sw-killswitch.js.txt` (or `docs/pwa/sw-killswitch.js`) | ready-to-copy self-unregistering worker; not served as `/sw.js` until needed | ~25 lines |
| `public/html/_sw.js` | registration for static pages | ~15 lines |
| `public/html/{profile,messages,onboarding}.html` (edit) | `<link rel="manifest">`, `theme-color`, `<script src="/html/_sw.js" defer>` | +3 lines each |
| `src/components/pwa/ServiceWorkerRegistrar.tsx` | client registrar + kill flag + hourly `update()` on visibility | ~50 lines |
| `src/app/layout.tsx` (edit) | mount the registrar; optional `appleWebApp` metadata (see iOS research) | +3 lines |
| `src/lib/pwa/sign-out-device.ts` | push unsubscribe + SW purge message, called by every sign-out path | ~40 lines |
| `src/app/api/version/route.ts` | `force-static`, returns `VERCEL_GIT_COMMIT_SHA` for the refresh toast | ~15 lines |
| `src/proxy.ts` (edit, gate file) | matcher skip for `sw.js`, `offline.html`, `manifest.webmanifest` | 1 line |
| `next.config.ts` (edit) | `/sw.js` headers | ~10 lines |
| `scripts/check-pwa.mjs` | manifest/icon/header/no-redirect checks against `next start` | ~120 lines |
| `docs/pwa/RUNBOOK.md` (or a journal section) | kill-switch steps, how to test, "bump SW_VERSION" rule | short |

---

## 9. Sources (with dates)

| Source | Date |
|---|---|
| https://nextjs.org/docs/app/guides/progressive-web-apps (and bundled copy in `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`) | lastUpdated 2026-07-30, docs v16.3.6 |
| https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest (bundled `.../01-metadata/manifest.md`) | docs v16.3.x, read 2026-09-24 |
| Bundled `node_modules/next/dist/docs/01-app/02-guides/offline-support.md` (`useOffline`, experimental) | Next 16.3.4 |
| vercel/next.js PRs #94921 (2026-06-25), #94923 (2026-06-29), #95554 (2026-07-09), #95570 (2026-07-07), #95431 (2026-07-10), #96360 (2026-07-29); e2e tests `test/e2e/app-dir/service-worker*` (canary, last touched 2026-09-10) | as listed |
| https://serwist.pages.dev/docs/next/turbo; github.com/serwist/serwist `packages/turbo/src/index.ts`, `index.worker.ts`, `examples/next-turbo-basic` | main branch read 2026-09-24; packages 9.5.12 published 2026-07-22 |
| https://blog.logrocket.com/nextjs-16-pwa-offline-support/ | 2026-01-14 |
| https://vercel.com/docs/skew-protection | last_updated 2026-09-16 |
| https://vercel.com/changelog/optimized-cdn-caching-and-deploying-of-immutable-static-assets | 2026-07-17 |
| https://makerkit.dev/blog/tutorials/force-update-nextjs | 2026-02-03 |
| https://web.dev/articles/service-worker-lifecycle | 2016-09-29 (still the canonical lifecycle reference) |
| https://developer.chrome.com/docs/workbox/service-worker-lifecycle | updated 2021-09-24 |
| https://developer.chrome.com/docs/workbox/remove-buggy-service-workers | updated 2021-10-20 |
| https://web.dev/blog/navigation-preload | updated 2017-02-15 |
| https://developer.chrome.com/blog/update-install-criteria | 2023-12-05 |
| https://developer.chrome.com/docs/devtools/progressive-web-apps | Chrome for Developers (living page) |
| https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register | modified 2026-06-10 |
| https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data (+ mdn/browser-compat-data) | modified 2025-11-21; BCD read 2026-09-24 |
| https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_response_header_name | modified 2025-07-11 |
| https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts | modified 2026-09-14 |
| https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ | 2023-02-16 |
| https://bugs.webkit.org/show_bug.cgi?id=181849 | filed 2018; current status UNVERIFIED |
| GoogleChrome/lighthouse release v12.0.0 notes ("PWA Category Removal") | 2024-04-22 |
| GoogleChrome/workbox releases (v7.4.1) | 2026-05-05 |
| ChromeDevTools/devtools-protocol `json/browser_protocol.json` (`Page.getAppManifest`, `Page.getInstallabilityErrors`) | master, read 2026-09-24 |
| Live GETs of https://www.connectvibe.app (`/`, a `/_next/static/immutable/` chunk, `/html/_persistence.js`, `/icon.png`, `/manifest.webmanifest`, `/sw.js`) | 2026-09-24 |

## 10. UNVERIFIED — confirm before building on it

- Vercel plan tier and whether Skew Protection is enabled for the Vibe project (Settings → Advanced).
- Whether previews have Deployment Protection (affects manifest `crossorigin` and phone testing).
- How long Vercel keeps old immutable static files reachable after a deploy.
- Whether Next 16.3's `/_next/static/service-worker/sw.js` stays mutable (not `immutable`, `max-age=0`) on **Vercel** production. Only matters for option B.
- Whether Chrome's automatic install *prompt* still requires a fetch handler in Sept 2026 (menu install doesn't).
- Web push inside the iOS Simulator; whether Home Screen apps still have storage separate from Safari on current iOS.
- Whether local `.env.local` points at the production Supabase project (affects tunnel testing).
- Whether `.git` is present in Vercel builds (Serwist example's `git rev-parse`; moot if option A).
