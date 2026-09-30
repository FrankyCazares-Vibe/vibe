# 3B map: client push library + service worker (wave 3′)

Read-only map, 2026-09-25, HEAD 55351a9. Every claim cites `file:line`. Paths are relative to `/Users/franciscocazares/vibe`.

## 1. `public/sw.js` (296 lines)

- **`SW_VERSION = "2026-09-24-3"`** at `public/sw.js:25`. The header says to bump it on every edit (`:6-8`). The URL and the
  options `{ scope: "/", updateViaCache: "none" }` are permanent (`:9-12`).
- Constants: `OFFLINE_URL "/offline.html"` `:27`, `OFFLINE_CACHE` `:28`, `FALLBACK_URL "/campus"` `:29`,
  `DEFAULT_TITLE "Vibe"` `:30`, `DEFAULT_BODY "You have new activity"` `:31`.
- Lifecycle: install = `skipWaiting` + precache offline page (`:37-39`). Activate = enable navigationPreload, delete
  every other cache, `clients.claim()` (`:41-51`). Fetch handles same-origin GET navigations outside `/api/` only (`:79-96`).

### `push` handler (`:148-184`)
- `readPayload(event.data)` (`:186-193`): `data.json()` inside try/catch. There is no `text()` fallback. Anything that
  isn't an object becomes `null`, and the notification then uses the defaults.
- `n = payload.notification`, used only when it is an object (`:150`).
  - `title = nonEmptyString(n.title)` (`:151`).
  - `body` is used when it is a string (`:152`).
  - `url = sameOriginUrl(n.navigate)` (`:153`; helper `:288-296`, which accepts relative or absolute input and returns
    an absolute same-origin href or null).
  - `tag = nonEmptyString(n.tag)` (`:154`).
- Options passed to `showNotification` (`:155-166`):
  - `body`: the body, or `""` when there's a title, or `DEFAULT_BODY` otherwise (`:156`)
  - `icon: "/icons/icon-192.png"` (`:157`)
  - `badge: "/icons/badge-mono-96.png"` (`:158`)
  - `data: { url: url || FALLBACK_URL }` (`:159`)
  - `tag`, only when present (`:163`)
  - `navigate: url`, a non-standard Safari option, only when same-origin (`:166`)
  - **No `renotify`**, and no `requireInteraction`, `silent`, `timestamp`, `vibrate`, `actions`, `image`, `lang` or `dir`.
- **`renotify` is NOT honoured today.** The comment at `:161-162` says a same-tag notification replaces the earlier one
  "quietly (no renotify)". Nothing reads `n.renotify`.
- Badge (`:168`): `readBadge(payload.app_badge, n.app_badge)` reads the top level first, then the copy inside
  `notification`. It accepts an integer ≥0 or a numeric string (`:197-203`).
  - `setBadge` (`:207-213`) calls `self.navigator.setAppBadge(count)` when it exists and swallows any error.
  - It runs in parallel with `showNotification` (`:169-183`).
- If `showNotification` rejects, the `.catch` shows the plain `DEFAULT_TITLE` / `DEFAULT_BODY` with
  `data.url = FALLBACK_URL` (`:175-180`). So a browser that refused an option still shows something.

### `notificationclick` (`:219-228`) and `openInApp` (`:230-255`)
- It closes the notification, then picks the first same-origin value from `data.url`, then `notification.navigate`,
  then `FALLBACK_URL` (`:223-226`).
- `openInApp`:
  1. A top-level window already at that exact href, controlled or not, is focused (`:233-235`).
  2. Otherwise the most recent controlled top-level window is focused and then `client.navigate(url)` is called
     (`:242-251`).
  3. Otherwise, or if that fails, `clients.openWindow(url)` (`:254`).
- `topLevelWindows` filters `frameType === "top-level"` (`:260-265`), so the `/html/messages.html` iframe is never navigated.

### `message` handler (`:271-275`)
- `{type: "SIGNED_OUT"}` → `deleteCachesExceptOffline()`, and that's all it does.
- It does not touch the push subscription and does not clear the badge.
- The page must post it via `registration.active.postMessage` or `navigator.serviceWorker.controller.postMessage`.
  The comment names `leaveDeviceClean` (wave 3) as the sender (`:268`).

### Missing from the worker
- There is no `pushsubscriptionchange` handler (grep over src/public: none).
- There is no page-side `setAppBadge` / `clearAppBadge` anywhere. The only call is `sw.js:209`.
- Nothing calls `GET /api/me/badge` yet (grep: only the route itself).

## 2. The push TAG scheme today, and what "honour renotify, then one tag per thread" means

### Tags as built (`src/lib/push/payload.ts`, `buildPushMessage` `:321-432`)
| kind | `tag` | `threadId` | line |
|---|---|---|---|
| follow | `follows` (one per recipient) | – | `:333` |
| like | `like:<post>` | – | `:336` |
| comment | `comment:<post>` | – | `:346` |
| mention (post) | `mention:<post>` | – | `:358` |
| mention (club chat) | `mention:<message>` | – | `:371` |
| org_invite / org_request_approved | `<kind>:<org>` | – | `:386` |
| **dm** | **`dm:<channel>:<message>`: one per MESSAGE** | `dm:<channel>` | `:397-398` |
| **group_message** | **`dm:<channel>:<message>`** | `dm:<channel>` | `:410-411` |
| message_request | `request:<channel>` (per thread) | `dm:<channel>` | `:426-427` |

- The header comment `payload.ts:31-37` records the reason. sw.js has no renotify, so critic item 11's fallback was taken:
  a tag per message, with the thread (iOS thread-id and the Web Push Topic) staying `dm:<channel>`.
- `toWebPush` (`:458-471`) writes `notification: {title, body, navigate, tag}`, plus `app_badge` when known, inside
  (`:466`) and at the top level (`:468`), and `mutable: false` (`:469`). No `renotify` key exists.
- `webPushTopic` (`:483-485`) = sha256(`threadId ?? tag`), cut to 32 characters. It is already **per thread** for chat
  and doesn't change.
- `toFcm` (`:498-523`) reuses **the same `m.tag`**:
  - `data: {url, tag, kind}` (`:503`)
  - `android.notification.tag` (`:509`)
  - `apns-collapse-id` (`:513`)
  - `"thread-id": threadId ?? tag` (`:517`)
- `dispatch.ts:857-858` builds one web payload and one Topic per outbox row and sends the same bytes to every web
  device (`:864`). FCM gets `toFcm(message, token)` (`:866`).
- The per-tag limiter touches only like and follow (`dispatch.ts:888-891`), so changing chat tags doesn't affect it.

### The critic rulings
- **Item 9** (`handoffs/wave-plan-pwa/critic-push.md:101-106`): a same-tag replacement is quiet only in our SW. On
  Android (`android.notification.tag`) and iOS (`apns-collapse-id`) a replaced notification **alerts again**. That is why
  like and follows got the `push-tag:<recipient>:<tag>` 1-per-10-min limit.
- **Item 11** (`critic-push.md:117-122`): the preferred ruling is `"renotify": true` **inside `notification`** for DMs,
  group messages and requests, and a ≤10-line sw.js edit `if (tag && n.renotify === true) options.renotify = true;`
  with a SW_VERSION bump. A tag per message was only the fallback.

### The change, concretely
1. **sw.js**
   - After `:163`, add `if (tag && n.renotify === true) options.renotify = true;`. The `tag &&` guard matters: Chrome
     throws a TypeError for `renotify` without a tag. The `.catch` at `:175-180` would then show the generic default.
   - Fix the comment at `:161-162`.
   - Bump `SW_VERSION` at `:25`.
2. **payload.ts**
   - `:397` and `:410`: `tag: \`dm:${event.channelId}\`` (drop `:${event.messageId}`).
   - Carry the flag: either add `renotify?: boolean` to `PushMessage` (`:71-85`), or derive it in `toWebPush` from
     `m.kind ∈ {dm, group_message, message_request}`.
   - In `toWebPush` (`:460-465`), put `renotify: true` **inside `notification`**, after `tag`, for those kinds only.
   - Update the header comment at `:31-37`.
   - Tests to update:
     - `payload.test.ts:86-107` pins the notification keys to exactly `["title","body","navigate","tag","app_badge"]` (`:107`).
     - `:219-228` asserts that tags differ per message ("sw.js has no renotify").
     - `:144-155` expects FCM tags `dm:${CHANNEL}:${MESSAGE}`.
3. **Is the field legal for WebKit?**
   - `research/critic.md:46` (C1) read WebKit `NotificationJSONParser.cpp`. `parseNotificationOptions` reads only
     dir, lang, body, tag, icon, data and silent (`:180-227`) and **ignores unknown keys**.
   - The "rejects a declarative message with an invalid field" rule (`critic-push.md:274`, `research/critic.md:47` C2)
     is about bad **values** of fields it does parse: a relative `navigate` or `icon` fails `URL{}` with no base.
     Unknown keys aren't covered by it.
   - So `notification.renotify: true` should be ignored by WebKit, not rejected. But `research/web-ios.factcheck.md:19`
     calls "neither parser rejects unknown keys" **"my reading of the source; test it"**. Device-test it on iOS 18.4+.
   - Don't put it at the top level. sw.js reads `n.*`, and the top level holds only `web_push`, `notification`,
     `app_badge` and `mutable` (R13, `plan.md:27`).
   - iOS 18.4+ with `mutable:false` never runs sw.js (`research/critic.md:56` C11). There `renotify` does nothing;
     how iOS treats a same-tag replacement is unverified.
4. **FCM side-effect (decide this)**
   - `toFcm` uses the same `m.tag` for the Android tag and `apns-collapse-id` (`:509`, `:513`).
   - A per-thread DM tag would make each new message **replace** the previous one in the phone's shade (still alerting,
     per item 9). They would no longer stack.
   - Options:
     - (a) Keep a per-message id for FCM and give only the web a per-thread tag. For example, `toWebPush` writes
       `m.threadId ?? m.tag`, or add a `webTag` field.
     - (b) Accept that the store apps collapse a thread.
   - Tests `:144-155` follow whichever is chosen.
5. **Browser reality check (general knowledge, UNVERIFIED here):**
   - `renotify` is Chromium-only (Chrome and Edge).
   - Firefox and Safari don't implement the option and ignore it.
   - So a per-thread tag + `renotify` could still replace quietly in Firefox. Only a per-message tag alerts
     everywhere. Test Firefox before dropping the per-message tag.

## 3. Registration and platform helpers

### `src/components/pwa/ServiceWorkerRegistrar.tsx` (`"use client"`)
- **The only export is `ServiceWorkerRegistrar(): null`** (`:40`). It's mounted once in the root layout
  (`src/app/layout.tsx:71`), so it runs on every React route.
- Side-effect import of `@/lib/pwa/install-prompt` (`:9`).
- Constants: `SW_URL "/sw.js"` `:12`, `SW_OPTIONS {scope:"/", updateViaCache:"none"}` `:19`,
  `PRODUCTION_HOST "www.connectvibe.app"` `:26`, `UPDATE_CHECK_MS` = 1 h `:29`.
- Gates, in order:
  1. No `serviceWorker` → return (`:42`).
  2. `NEXT_PUBLIC_SW_KILL === "1"` → unregister all and delete every cache (`:47-51`).
  3. **Store app** (`appShellOnClient() !== null`) → **unregister all, return** (`:58-61`). There is never a SW, and so
     never web push, inside the Capacitor apps.
  4. Hostname gate: registers only on `www.connectvibe.app`, or anywhere with `NEXT_PUBLIC_SW_DEV === "1"`. Otherwise it
     unregisters (`:63-70`).
- **Desktop too:** there's no platform gate. Any browser on the production host registers, desktop included.
- It registers after `load` (`:99-100`). An hourly `update()` runs on `visibilitychange` (`:92-97`).
- **The `ServiceWorkerRegistration` is kept in a closure variable (`:72`, `:83`) and not exported.**
  - Other code must use `navigator.serviceWorker.ready`. It never rejects and **never resolves** where no worker is
    registered: localhost without the flag, Preview, the store apps, the kill switch.
  - Or use `navigator.serviceWorker.getRegistration("/")`, which resolves `undefined` there.
  - A push client should call `getRegistration()` first and race `ready` against a timeout.
- Static pages have a twin, `public/html/_sw.js`:
  - production host only (`:81`)
  - skips the store app (`:68-79`)
  - same `register("/sw.js", {scope:"/", updateViaCache:"none"})` (`:88`)

### `src/lib/pwa/display-mode.ts` (pure, node-testable)
- `type DisplayModeEnv = { navigatorStandalone?: unknown; matchStandalone: boolean; matchFullscreen: boolean }` (`:19-29`)
- `isStandalone(env: DisplayModeEnv): boolean` (`:41-45`). On iOS, fullscreen counts only when `navigator.standalone`
  is a boolean.
- `type Platform` (`:55-67`) =
  `"ios-app" | "android-app" | "ios-safari" | "ios-other-browser" | "ios-in-app" | "android-chrome" | "android-samsung" | "android-other" | "desktop-chromium" | "desktop-safari" | "firefox" | "other"`
- `type PlatformEnv = { ua?: unknown; maxTouchPoints?: unknown }` (`:70-73`)
- `detectPlatform(env: PlatformEnv): Platform` (`:125-153`). The order is the contract. The store app comes first
  (`:131-132`). iPad-as-Mac counts as iOS through touch points (`:100-105`). Android Firefox → `"android-other"`, so
  `"firefox"` means desktop.
- `isIosPlatform(p: Platform | null | undefined): boolean` (`:165-169`) is **false for "ios-app"**.

### `src/lib/pwa/install-prompt.ts`
- `interface BeforeInstallPromptEvent` (`:22-25`)
- `type InstallPromptListener` (`:27`)
- `getInstallPrompt(): BeforeInstallPromptEvent | null` (`:54`)
- `onInstallPromptChange(listener): () => void` (`:59-64`)
- `wasInstalledThisSession(): boolean` (`:67-69`)
- Module-level listeners for `beforeinstallprompt` / `appinstalled` (`:39-51`)

### `src/lib/pwa/use-standalone.ts` (`"use client"`)
- `useIsStandalone(): boolean` (`:63-65`)
- `usePlatform(): Platform | null` (`:94-96`, cached `:68-79`)
- Both give false or null on the server and during hydration.

### Platform → `PushPlatform` mapping (it doesn't exist yet; 3B needs it)
- `PushPlatform` is `"ios-app" | "android-app" | "ios-web" | "android-web" | "desktop-web" | "other"`
  (`src/lib/push/device-address.ts:25-31`).
- Suggested map:
  - `ios-safari | ios-other-browser | ios-in-app` → `ios-web`
  - `android-chrome | android-samsung | android-other` → `android-web`
  - `desktop-chromium | desktop-safari | firefox` → `desktop-web`
  - `other` → `other`
  - the two app values stay as they are (and must use `transport: "fcm"`)
- Why it matters: `pickDevices` mutes only `ios-web` / `android-web` when a fresh app device exists (`payload.ts:572-578`).

## 4. The native bridge

### `src/lib/native/bridge.ts`
- No imports, erasable TypeScript only, and never throws (`:1-20`).
- `export type AppPlugin` (`:31-35`)
- `getPlugin<T extends object>(name: string): T | null` (`:67-78`) returns `window.Capacitor.Plugins[name]`.
  - It is null on the server, in a browser, when `isNativePlatform()` is false, or when the plugin isn't in this app build.
- `listenNative<E>(pluginName, eventName, listener: (e: E | undefined) => void): () => void` (`:102-126`)
  - It accepts `{remove}` returned directly or in a promise.
  - **The shell drops every listener when a page starts loading** (`:99-100`).
- `openInBrowser(url: string): Promise<boolean>` (`:137-174`)
- `nativeShare(opts): Promise<boolean>` (`:183-207`)
- `writeCacheFile(name, base64): Promise<string | null>` (`:214-224`)
- `nativeLaunchUrl(): Promise<string | null>` (`:227-232`)
- `NATIVE_BACK_EVENT = "vibe:native-back"` (`:239`)
- `exitApp(): void` (`:242-245`)
- `styleStatusBarForCream(android: boolean): void` (`:252-257`)
- **`appPathFromLink(url): string | null`** (`:272-282`) keeps only `https:` + host `www.connectvibe.app` (`APP_HOST`
  `:260`). It returns `pathname + search + hash` with leading slashes collapsed. Its comment already anticipates
  "a notification later" (`:263-265`).
- `type AnchorAction` (`:287-291`); `anchorAction(href, target, download, pageOrigin)` (`:308-329`)
- The helper `settle` (`:85-91`) is **not exported**.

### `src/lib/native/detect.ts`
- `type AppShell = "ios-app" | "android-app"` (`:15`)
- `detectAppShell(ua): AppShell | null` (`:26-31`, UA token `VibeApp/<n> (ios|android)` `:23`)
- `appShellOnClient(): AppShell | null` (`:44-53`, UA first, then `Capacitor.isNativePlatform()`)

### `src/lib/native/use-app-shell.ts`
- `useAppShell(): AppShell | null` (`:47-49`), null during hydration.

### `src/lib/native/server.ts` (`server-only`)
- `appShellFromHeaders(h)` (`:26-28`)
- `appShellFromRequest()` (`:34-36`)

### `src/components/native/NativeBridge.tsx`
- `export function NativeBridge(): null` (`:125-163`), mounted in `src/app/layout.tsx:77`. It does nothing outside the
  app (`:127-128`).
- It registers:
  - `App.appUrlOpen` → `openFromNative(e?.url)` (`:135-137`)
  - the launch URL once per app session (`:141-145`)
  - Android `backButton` (`:148-150`)
  - a document click handler (`:152`)
- **`openFromNative` exists but is module-private (not exported)**, at `NativeBridge.tsx:42-50`:
  ```ts
  function openFromNative(url: string | null | undefined): void {
    const target = appPathFromLink(url);
    if (!target || target === currentPath() || target === pendingTarget) return;
    pendingTarget = target;
    window.location.assign(target);
    if (currentPath() === target) pendingTarget = null;
  }
  ```
  - It relies on the module-level `pendingTarget` (`:35`) and `currentPath()` (`:37-39`), and uses a full-load
    `location.assign`, not `router.push`.
  - To reuse it for notification taps, 3B has two choices:
    - move it, with `pendingTarget`, into `bridge.ts` (or a new `src/lib/native/open-link.ts`) and export it. This
      touches NativeBridge.tsx ownership.
    - add the `notificationActionPerformed` listener inside NativeBridge itself.
- `LAUNCH_URL_KEY = "vibe.launchUrlHandled"` (sessionStorage, `:27`; `claimLaunchUrl` `:59-67`). **leaveDeviceClean
  must NOT clear it.** Clearing it lets the launch link reopen on the next load.

## 5. Server contracts the client calls

### `POST /api/me/push-devices` (`src/app/api/me/push-devices/route.ts:116-179`)
- Body: `{ transport: "webpush"|"fcm", address, keys?: {p256dh, auth}, platform, app_version? }` (`:26`,
  parser `device-address.ts:200-249`).
- Validation rules:
  - `platform` must be one of `PUSH_PLATFORMS` (`device-address.ts:35-42`, `:209`).
  - `fcm` ⇔ `ios-app` / `android-app` (`:212`).
  - An FCM token matches `/^[A-Za-z0-9_:-]{100,2048}$/` (`:77`) and must have no `keys` (`:226`).
  - A webpush endpoint must be https, ≤1024 characters, printable ASCII, with no `@`, `\` or `#`, must round-trip
    through `new URL` byte for byte, and must be on an allowed host (`:103-125`). Allowed hosts: `fcm.googleapis.com`,
    `updates.push.services.mozilla.com`, `web.push.apple.com`, `*.push.apple.com`, `*.notify.windows.com` (`:57-68`).
  - `p256dh` must decode to 65 bytes starting with 0x04 (`:154-158`); `auth` to 16 bytes (`:161-165`).
  - `app_version` is at most 32 characters of `[0-9A-Za-z._+-]` (`:83`, `:214-221`).
  - So `PushSubscription.toJSON()` → `{address: endpoint, keys}` fits as-is.
- Responses, in check order:
  1. **403 `{ok:false, code:"wrong_origin"}`** (`:121-128`), before auth. It needs `Content-Type: application/json`
     and `Origin` equal to `pushSiteOrigin()` (`device-address.ts:274-281`). That origin is
     `https://www.connectvibe.app` in production and `http://localhost:3000` under `next dev`; **everywhere else it is
     null, so this is always a 403** (Preview, `next start`) (`src/lib/push/config.ts:35-39`).
  2. 401 `{ok:false, error:"Unauthorized"}` (`:130-133`, no code).
  3. 400 `{ok:false, error}` (`:135-138`): bad JSON, a body over 8192 characters, or a parser error.
  4. 429 `{ok:false, error}` with `retry-after` (`:141-142`; `src/lib/rate-limit.ts:133-147`). **20 per hour** per
     student (`:47`).
  5. 403 `code:"terms_required"` or `"account_restricted"` (`:146-147`; `src/lib/moderation/access.ts:113-116`). The
     proxy also blocks this POST for restricted accounts (`src/proxy.ts:175-179` lets only DELETE through).
  6. **403 `code:"push_unavailable"`** when `!pushAllowedFor(userId)` (`:148`). The same code covers push being off
     globally and a student not on the allowlist.
  7. 503 `code:"push_unavailable"` when the table is missing (`:168-172`); 500 `{ok:false, error:"Request failed"}` (`:173-174`).
  8. 200 `{ok:true}` (`:178`).
- Side effects:
  - Upsert on `address` (`:153-167`), which re-points `user_id`, stamps `origin`, sets `last_seen_at = now` and
    resets `failures` to 0.
  - Trims to the newest 10 devices per student (`:50`, `:94-114`).
- **The UI can tell "not for you" apart**: `code === "push_unavailable"`. But only **after** it has a real
  subscription or token. The body is parsed (`:137`) before the allowlist check (`:148`), so there is no cheap probe.

### `DELETE /api/me/push-devices` (`:181-213`)
- Body `{address}`: any string of 1–2048 characters (`addressFromBody`, `device-address.ts:258-263`).
- Responses:
  - 401
  - 400 for bad JSON or a missing address
  - 429 at 30 per hour, its own bucket (`:48`, `:194-195`)
  - 200 `{ok:true}`, also when the table is missing (`:205-207`)
  - 500
- No origin check and no Terms gate. It deletes only the caller's own row (`:199-203`). The proxy allows it for
  restricted accounts (`src/proxy.ts:179`).

### `POST /api/auth/logout` (`src/app/api/auth/logout/route.ts`)
- The body `{push_address}` is optional (`:67-69`). A bad, empty or oversized body is ignored, never a 400 (`:16-24`).
- `forgetPushDevices` (`:45-60`) deletes:
  - **EVERY row of the signed-in student** (`:50`), and
  - any row whose `address = push_address`, **whoever owns it** (`:51`).
  It never fails the sign-out.
- Then `supabase.auth.signOut()` runs, which is global (`:86`). Response `{ok:true}` (`:87`). The proxy allows it for
  restricted accounts (`src/proxy.ts:176`).
- Callers today send no body:
  - `SettingsClient.tsx:1176` (vibeRequest)
  - `suspended-actions.tsx:162`
  - `accept-terms-form.tsx:82`
- Browser-only `signOut` with no route call: `verify-school/page.tsx:235` and `EmailLinkProblem.tsx:75`.

### `GET /api/me/badge` (`src/app/api/me/badge/route.ts:19-41`)
- 200 `{ok:true, total, notifications, messages}` (`:35-40`), 401, or 500 (it fails closed; never a made-up 0).
- No rate limit and no Terms gate (`:14-18`).

### `src/lib/push/config.ts`
- `PUSH_SITE_ORIGIN` (`:21`), `PUSH_DEV_ORIGIN` (`:24`), `pushSiteOrigin(env)` (`:35-39`)
- `pushEnabled(env)` (`:46-48`): `PUSH_ENABLED === "true"` and a site origin exists.
- `pushAllowedFor(userId, env)` (`:57-67`): `PUSH_ALLOWLIST` is `"*"` or a comma list of ids; unset means nobody.
- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is read only server-side**, in `vapidConfig` (`:119`, shape `^B[A-Za-z0-9_-]{86}$` `:80`).
  - No client code references it yet.
  - The client must write `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` literally so Next inlines it.
  - It needs a base64url → `Uint8Array` step for `applicationServerKey`.

### Is there an endpoint to ask "is push available for me?"
- **No.**
- `GET /api/health/push` (`src/app/api/health/push/route.ts:31-63`) is platform-admin only and returns
  deploy-wide booleans (`:40-49`), not per-student ones.
- The only per-student signal is the 403 `push_unavailable` above.
- Suggestion: a `GET /api/me/push-devices` → `{ok, available: pushAllowedFor(uid) && siteOrigin}` in the 2B-owned
  route, so the card can hide itself **before** the permission prompt.

## 6. Per-device storage keys

All of these are in localStorage unless marked otherwise.

| key | where defined / written | holds | personal? |
|---|---|---|---|
| `vibe_user_v1` | `public/html/_persistence.js:12`; written by `src/app/profile/profile-html-bridge.tsx:93` and `public/html/onboarding.html:3668`; read about 59× in profile.html | profile snapshot for the static pages | **yes** |
| `vibe_posts_v1` | `_persistence.js:13` (also profile.html) | posts cache | **yes** |
| `vibe_vibes_v1` | `_persistence.js:14` | vibes | yes |
| `vibe_relationships_v1` | `_persistence.js:15` | map of slug → connected/pending/following | **yes** |
| `vibe_otto_lastpost_v1` | `public/html/_otto.js:1005` | last Otto post `{text, ts}` | **yes** |
| `vibe_otto_v1` | `public/html/onboarding.html:3667` | Otto config | yes |
| `vibe_cal_events_v1` | `public/html/messages.html:1689`, `public/html/profile.html:7309` | saved calendar events | **yes** |
| `vibe_recent_searches_v1` | `src/app/campus/campus-home.tsx:4590`, `profile.html:6908` | recent searches | **yes** |
| `vibe_onb_draft_v1:<userId>` | prefix `ONBOARDING_DRAFT_KEY_PREFIX` `src/lib/onboarding/draft.ts:50`; `onboarding.html:1620` | onboarding draft | yes (cleared by `clearDraft`) |
| `vibe_profile_tour_seen_v1`, `vibe_campus_tour_seen_v1`, `vibe_network_tour_seen_v1` | `src/components/mobile/use-mobile-tour.ts:68-70` (also `campus-home.tsx:463`, `NetworkPageClient.tsx:148`) | tour-seen flags | no (UI) |

Keys that aren't `_v1`-suffixed, for completeness:
- `vibe_tour_pending` (localStorage, `campus-home.tsx:394`)
- `vibe_campus_confirm_dismissed` (sessionStorage, `campus-confirm-banner-view.ts:13`)
- the sessionStorage keys `vibe.recoveryToken.v1` (`update-password/page.tsx:59`), `vibe.schoolVerifyLink.v1`
  (`verify-school/page.tsx:22`), `vibe.schoolEmailSent.v1` (`school-email/page.tsx:43`) and `vibe.launchUrlHandled`
  (`NativeBridge.tsx:27`; do not clear, see §4)

Static-page helper: `vibeClearAll()` (`_persistence.js:40`) clears only the four `VIBE_KEYS`. A React module can't call
it, so `leaveDeviceClean` must `removeItem` the keys by name.

**`clearDraft`**
- Signature: `export function clearDraft(userId?: string | null, opts?: DraftOptions): void`, at
  `src/lib/onboarding/draft.ts:298`.
- With no id it removes every key starting with `vibe_onb_draft_v1:` from localStorage (`resolveStorage` `:146-153`)
  and cancels queued saves. It never throws.
- Callers:
  - `SettingsClient.tsx:1190` and `:1258`
  - `suspended-actions.tsx:185` and `:211`
  - `accept-terms-form.tsx:92`
  - `OnboardingMobile.tsx:645` (with an id)

## 7. FirebaseMessaging (the store apps)

- **Not imported anywhere in `src`.** A grep for `capacitor-firebase|FirebaseMessaging` over the repo, excluding
  node_modules, hits only `mobile/README.md:159`. `bridge.ts:5-9` confirms the site talks only to
  `window.Capacitor.Plugins`.
- **Not installed yet.**
  - `mobile/package.json:14-28` has no `@capacitor-firebase/messaging`.
  - `mobile/node_modules/@capacitor-firebase/` **does not exist**, so the requested `dist/esm/index.js` couldn't be read.
  - `critic-s2s3.md:218-231` deferred the install to the push wave. The planned pin is 8.5.2 (`plan.md:132`,
    `research-stores/wrapper-tech.factcheck.md:61`). With it comes the large `firebase-ios-sdk` SPM clone.
- Everything below comes from the **upstream source on GitHub `main`** (capawesome-team/capacitor-firebase,
  packages/messaging), not the pinned 8.5.2. Re-check it against `dist/esm/definitions.d.ts` once installed.
- **Plugin name `"FirebaseMessaging"`**:
  - `src/index.ts`: `registerPlugin('FirebaseMessaging', …)`
  - Android: `@CapacitorPlugin(name = "FirebaseMessaging", permissions alias "receive" = POST_NOTIFICATIONS)`
  - iOS: `jsName "FirebaseMessaging"`
  - So the web side calls `getPlugin<FirebaseMessagingPlugin>("FirebaseMessaging")`.
- Methods:
  - `checkPermissions()` and `requestPermissions()` → `{receive: PermissionState}`. PermissionState is
    `"prompt" | "prompt-with-rationale" | "granted" | "denied"`.
  - `isSupported()`
  - `getToken(opts?: {vapidKey?, serviceWorkerRegistration?})`, whose options are web-only → `{token: string}`
  - `deleteToken(): Promise<void>`
  - `getDeliveredNotifications()`, `removeDeliveredNotifications({notifications})`, `removeAllDeliveredNotifications()`
  - `subscribeToTopic` / `unsubscribeFromTopic({topic})`
  - `createChannel` / `deleteChannel` / `listChannels` (Android 26+)
  - `removeAllListeners()`
- Events (`addListener(name, fn)`):
  - `"tokenReceived"` → `{token}`
  - `"notificationReceived"` → `{notification}`
  - `"notificationActionPerformed"` → `{actionId: string, inputValue?: string (iOS), notification}`. `actionId` is
    `"tap"` for a plain tap on **both** platforms.
  - `"apnsTokenReceived"` → `{token}` (iOS)
- `Notification` = `{id?, title?, body?, subtitle? (iOS), tag? (Android), clickAction? (Android), link? (Android), image? (web), data?: unknown}`.
- **Where the tapped URL lives: `event.notification.data.url`.** Our FCM `data` is `{url, tag, kind}`, all strings
  (`payload.ts:503`).
  - iOS: `data` = the whole APNs `userInfo`, coerced. It includes `url`, `tag`, `kind` plus `aps`, `gcm.message_id`
    and `google.c.*`.
  - Android, tapped from the background: the intent extras. `handleOnNewIntent` needs `google.message_id`; `id` comes
    from it and every other extra, `google.*` included, goes into `data`.
  - Android in the foreground: `data = remoteMessage.getData()`.
  - Validate the URL like any other (see Gotchas). The value is absolute: `https://www.connectvibe.app/...`
    (`config.ts:21`).
- **Events use `notifyListeners(…, retainUntilConsumed = true)` on both platforms.** A cold-start tap is queued and
  handed to the first listener that attaches. The shell clears listeners at every page load (`bridge.ts:99-100`), so
  the tap listener must attach on **every** full load, from a root-layout component, like NativeBridge.
- Without `GoogleService-Info.plist`, iOS `getToken` rejects as "unavailable". Wrap every call (`settle` pattern).
- Foreground display: iOS reads `plugins.FirebaseMessaging.presentationOptions` from the Capacitor config, which isn't
  set (`mobile/capacitor.config.ts:70+`). On Android, a notification message that arrives in the foreground isn't
  shown by FCM (standard FCM behaviour, from general knowledge). This is a 3D/shell decision.

## Gotchas / open questions

1. **There's no "is push available for me?" probe.** `push_unavailable` (403) appears only after a real
   subscription or token is POSTed (`route.ts:137` before `:148`). Without a new GET, the card would show the OS
   permission prompt to students who aren't on the allowlist.
   - If the 403 comes back, the client should `unsubscribe()` or `deleteToken()` again rather than leave an orphan.
   - Treat `wrong_origin`, `terms_required` and `account_restricted` as "hide".
2. **`navigator.serviceWorker.ready` hangs forever** in the store apps, on localhost without `NEXT_PUBLIC_SW_DEV`, on
   Preview and under the kill switch (registrar `:58-70`). Use `getRegistration()` plus a timeout. Registration waits
   for `load` (`:99-100`), so an early tap may need `ready`.
3. **The rate limit is 20 POSTs per hour** (`route.ts:47`), while the plan says "re-sync on every open".
   - Static pages and store-app navigations are full loads, and each mounts again.
   - Throttle the re-sync, e.g. once a day per device, or only when the endpoint or token changes.
   - It still has to run well inside the 30-day `APP_FRESH_MS` and the 60-day expiry (`payload.ts:530-532`).
4. **Logout deletes ALL of the student's devices** (`logout/route.ts:50`). The other phones and laptops go quiet
   until their next open re-registers them. Re-sync-on-open is load-bearing; say so in the UI copy/tests.
5. **`appPathFromLink` accepts only `https://www.connectvibe.app`** (`bridge.ts:280`).
   - In a `CAP_DEV_URL` dev app, the page is `http://localhost:3000` and push URLs are too (`config.ts:24`, `:37`),
     so a tap does nothing there.
   - For taps, consider checking the origin against `window.location.origin`.
   - `openFromNative` isn't exported (`NativeBridge.tsx:42`). This is a file-ownership call for the planner.
6. **There is no `pushsubscriptionchange` handler in sw.js.** A rotated browser subscription stays dead until the
   next open re-syncs it. The sender deletes the old row on 404/410. Decide whether 3B adds one; that would need a
   SW_VERSION bump.
7. `SIGNED_OUT` (`sw.js:271-275`) only clears caches. The **page** must `getSubscription()` → `unsubscribe()`, and in
   the app `FirebaseMessaging.deleteToken()`.
   - Send `push_address` to logout **before** unsubscribing, while the address is still known.
   - Clear the badge with `navigator.clearAppBadge?.()`.
   - Nothing clears the icon badge on sign-out today.
8. **The per-thread tag also changes FCM** (§2.4). Pick (a) web-only thread tag or (b) collapse in the apps.
   - `renotify` is Chromium-only (UNVERIFIED here), so Firefox may still replace quietly.
   - That WebKit ignores `notification.renotify` is from a source reading, marked "test it"
     (`web-ios.factcheck.md:19`).
   - The R13 contract (`plan.md:27`) and `payload.test.ts:107` must be amended together.
9. **Platform mapping** (§3). A wrong map (e.g. Android web → `other`) breaks the "app silences web" rule
   (`payload.ts:572-578`). `fcm` must go with `ios-app`/`android-app` or the server returns 400 (`device-address.ts:212`).
10. **Badge in the page.** `/api/me/badge` → `navigator.setAppBadge(total)` exists only in browsers and installed web
    apps. In the store apps there's no badge plugin (`mobile/package.json`). The iOS app icon count comes only from
    `aps.badge` in pushes (`payload.ts:516`), so it won't clear on read until a plugin exists.
11. **iOS web subscribe** must run synchronously inside the tap, and only works in the installed Home Screen app
    (session-65 handoff `2026-09-25-session-65-next-waves.md:53`). `window.pushManager` is preferred on iOS 18.4+.
    `useIsStandalone`/`usePlatform` are false/null during hydration, so gate the button after mount.
12. **Firebase plugin not installed.** The API above is from upstream `main`. Verify it against the pinned 8.5.2
    `definitions.d.ts` once installed, especially `retainUntilConsumed` and the Android `data` from extras.
13. `vibeRequest` toasts on failure unless `quiet: true` (`src/lib/feedback/request.ts:34`, `:115-117`). Background
    re-syncs and logout-time DELETEs should be quiet.
14. **`DELETE /api/me` (account deletion)** at `src/app/api/me/route.ts:151` relies on the FK cascade to drop
    `push_devices` (UNVERIFIED here). The client should still unsubscribe and delete the token locally.
