# Installable app research: Android Chrome, desktop Chrome/Edge, Firefox, Samsung Internet, and server-side Web Push

Researched 2026-09-24 for the PWA wave (manifest + service worker + push, shipping before 2026-10-31).
Read-only pass. Web sources show their published or updated date. Repo claims show path:line. Anything I could not confirm is marked **UNVERIFIED**.

---

## 0. The short version (plain English)

- **Installing on Android and desktop Chrome/Edge is easy.** Chrome needs a manifest with a name, a 192px and a 512px icon, a `start_url` and a `display` mode, served over HTTPS, and the visitor has to click or tap once and stay about 30 seconds. Technically a service worker is no longer required just to install, but Chrome's *automatic* install prompt still looks for one with a real `fetch` handler. So we ship one anyway, and it needs it for push too.
- **We can put our own "Install Vibe" button on Android and desktop** by catching the browser's `beforeinstallprompt` event. It works in Chrome, Edge and Samsung Internet. It does not exist in Safari or Firefox.
- **Screenshots in the manifest get us an app-store-style install sheet** on Android and desktop instead of a plain banner. That is cheap to do, and worth doing for launch.
- **Samsung Internet has a live bug right now:** on Android 14 and up, installing a PWA from Samsung Internet is often blocked with an "old Android version" warning. The bug has been open since April 2026 with no fix. Tell Samsung users to install from Chrome.
- **Firefox:** on Android, "Add to Home screen" gives a browser shortcut, not a real app. On desktop there is a basic "pin to taskbar" on Windows only. Push notifications still work inside the Firefox browser without installing.
- **Notification permission is what we most need to get right.** Never ask on page load. Ask right after a meaningful action ("Get notified when Maya replies?"), show our own soft prompt first, and only then call the browser prompt. Since Chrome 155 on Android the browser prompt is a small chip that disappears if ignored, and an ignored prompt comes back as "default", not "denied".
- **Chrome now takes notification permission away** from sites that send lots of notifications nobody opens. **Installed web apps are exempt**, which is one more reason to push install first and then notifications.
- **Server side:** we generate one VAPID key pair **once** and never change it. If we rotate it, every subscription dies. Each send is an encrypted POST of at most about 4 KB, with a TTL. We delete a subscription when the push service answers 404 or 410.
- **Library: use `web-push` (npm 3.6.7).** It is old (last npm release January 2024) but it is the default Next.js recommends, it works on Vercel's Node runtime, and it does everything we need. There are a handful of small gotchas to wrap, covered in sections (c) and 7. Revisit when web-push 4.x ships (master has gone ESM-only), or if the sender moves to a Supabase Edge Function (Deno).
- **Apple's "Declarative Web Push" needs no special server code.** It is a JSON payload shape (`{"web_push": 8030, "notification": {...}}`) sent through the same encryption. If our service worker understands that same shape, **one payload format works for every browser.**

---

## (a) Install: criteria, prompts, manifest, WebAPK

### Plain English
Chrome decides whether a site can be installed from a short checklist. Most of it is the manifest file. What the user then sees is either a small banner or a richer app-store-style sheet, depending on whether we give it screenshots and a description. On Android, Chrome turns the install into a real Android app package, a "WebAPK". That is why an installed PWA shows up in the app drawer and in Android's settings like a native app.

### Chrome installability criteria today
Source: web.dev "What does it take to be installable?" (updated 2024-09-19), https://web.dev/articles/install-criteria. Also MDN "Making PWAs installable" (modified 2026-09-07), https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable.
- Manifest must have: `short_name` or `name`; `icons` including **192px and 512px**; `start_url`; `display` (or `display_override`) set to `fullscreen`, `standalone`, `minimal-ui` or `window-controls-overlay`; and `prefer_related_applications` absent or false.
- The page must be served over HTTPS, and the app must not already be installed.
- Engagement heuristic: the user has clicked or tapped the page at least once and spent at least 30 seconds on it (at any time, including a previous visit).
- **Service worker:** Chrome dropped the SW + `fetch` handler requirement for installing *from the menu* in Chrome 108 (mobile) and 112 (desktop). But "the algorithm that displays the install prompt still requires the presence of a fetch() handler". Source: "Revisiting Chrome's installability criteria", 2023-12-05, https://developer.chrome.com/blog/update-install-criteria.
- Chrome ignores **empty** fetch handlers. That comes from secondary search results, not an official page, so treat it as **UNVERIFIED**. **Recommendation:** register `/sw.js` with a real `fetch` handler, e.g. network-first for navigations with an offline fallback page. That keeps the automatic prompt and `beforeinstallprompt` eligible. Whether the 2023 statement still holds exactly in Chrome 15x is **UNVERIFIED**, since no newer official page says otherwise.
- "Universal install": Chrome desktop and Android can install *any* site from the menu ("Install page as app"), manifest or not (MDN 2026-09-07). That is a fallback, not a plan.

### `beforeinstallprompt` and the newer install APIs
- `beforeinstallprompt` is non-standard (WICG Manifest Incubations) and not Baseline. It is supported in Chromium browsers: Chrome, Edge, Opera and Samsung Internet. Firefox and Safari do not have it. Sources: MDN, modified 2026-07-28, https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event; web.dev Learn PWA "Installation prompt" (2022-03-09), https://web.dev/learn/pwa/installation-prompt.
- Pattern: `preventDefault()`, stash the event, show our button, then on click call `prompt()` and await `userChoice`. Listening for the event suppresses Chrome's Android mini-infobar, so our own UI must replace it. `appinstalled` fires on success.
- **`navigator.install()` (Web Install API):** origin trial in Chrome and Edge 143–150. Same-document install only for now. Rejects in incognito. Source: InfoQ, 2026-03-27, https://www.infoq.com/news/2026/03/web-install-api-origin-trial.
- **`<install>` HTML element:** behind a flag and in origin trial in Chrome and Edge 148–153. The browser renders a trusted install button with no JS needed, and the manifest must have an `id`. Source: Chrome blog, 2026-05-12, https://developer.chrome.com/blog/install-element-ot.
- **Recommendation for Oct 31:** ship `beforeinstallprompt`, which is stable. Skip the origin trials, because trials end and need tokens. Include a manifest `id` anyway so `<install>` can be adopted later.

### Richer install UI (screenshots and description)
Source: web.dev "How to add Richer Install UI", updated **2026-09-16**, https://web.dev/articles/web-apps/richer-install-ui. Background: https://developer.chrome.com/blog/richer-pwa-installation (Android Chrome 94+, desktop 108+).
- It needs at least one screenshot for the matching `form_factor`: `narrow` for mobile, `wide` for desktop. `description` is recommended.
- Screenshots must be JPEG or PNG, 320–3840 px per side, with the long side no more than 2.3× the short side. All screenshots of the same form factor must share one aspect ratio. Chrome shows up to 8.
- The description is truncated at about 7 lines (about 324 characters).
- **For Vibe:** 3–5 narrow screenshots (e.g. 1080×1920, ratio 1.78) of the feed, a club page, messages and events, plus 1–2 wide ones (e.g. 1920×1080), and a one-sentence description.

### Icons
- Vibe today has `src/app/icon.png` at **192×192**, `src/app/apple-icon.png` at 180×180, and `public/favicon-48.png` at 48×48 (measured with `sips`). **There is no 512px icon, and there is no maskable icon.** Both are required or strongly needed.
- Maskable icons put the logo inside a centred circle whose radius is 40% of the width. Provide **separate** `purpose: "any"` and `purpose: "maskable"` entries rather than `"any maskable"`. Source: web.dev "Adaptive icon support in PWAs with maskable icons", 2019-12-19, https://web.dev/articles/maskable-icon.
- Minimum set: 192 any, 512 any, 192 maskable, 512 maskable. Optionally also a monochrome notification `badge` icon (see section b/e).

### Identity and navigation fields
- **`id`:** identifies the app. If it is missing, Chrome 96+ derives it from `start_url`, so a later change to `start_url` creates a *different* app and a duplicate install. Set `"id": "/"` (or a fixed string) from day one, and check the "Computed App Id" in DevTools > Application > Manifest. Source: https://developer.chrome.com/docs/capabilities/pwa-manifest-id (2024-09-20).
- **`start_url`:** should be a route that works for both signed-in and signed-out users and does not redirect off-scope. Adding a query tag such as `/?source=pwa` helps analytics, but it has to stay stable, because it is part of the identity when no `id` is set.
- **`scope`:** `"/"`. Vibe mixes React routes and static `/html/*.html` pages on one origin, so a scope of `/` keeps both "in app". Anything outside the scope opens in a browser tab or custom tab.
- **`display` / `display_override`:** `display: "standalone"`. `display_override` is an optional fallback list, e.g. `["standalone"]`. `window-controls-overlay` is desktop-only; skip it.
- **`theme_color` / `background_color`:** Android uses them for the splash screen and status bar. `src/app/layout.tsx:31` sets `themeColor: "#FAF7F2"`. Match `theme_color` to it and set `background_color` to the first-paint background, so the splash doesn't flash.
- **`shortcuts`:** long-press menu entries on the Android launcher and the desktop taskbar, e.g. Messages, Events, New post. They are cheap and WebAPK picks them up.
- **`share_target`:** makes Vibe appear in the Android share sheet, **installed apps only**. GET is simple. Receiving files needs POST multipart plus a SW `fetch` handler. Source: https://developer.chrome.com/docs/capabilities/web-apis/web-share-target (2019-11-08; Android Chrome 76+, desktop 89+ = ChromeOS). There is also an unconfirmed third-party report that Samsung Internet install fails silently when `share_target` uses POST (a GitHub PR in an unrelated repo), so treat it as **UNVERIFIED**. **Defer share_target to after launch.**
- **`launch_handler`:** `{"client_mode": ["navigate-existing", "auto"]}` stops a second app window opening when a link or notification launches the app. Chrome and Edge only (desktop and Android). Source: MDN, modified 2025-11-13, https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler.

### WebAPK (Android)
- Only **Chrome on devices with Google Mobile Services** and **Samsung Internet on Samsung devices** mint WebAPKs. Edge, Firefox, Opera and Chrome without GMS add a browser-badged shortcut instead. Source: MDN, 2026-09-07 (URL above).
- Manifest updates: Chrome checks at most every 24 hours, or 30 days if updates are failing. A change to `name`, `short_name`, `icons`, `background_color`, `display`, `orientation`, `scope`, `shortcuts`, `start_url`, `theme_color` or `share_target` triggers a WebAPK re-mint. That happens only after all app windows are closed and the device is on Wi-Fi and charging. Desktop Chrome does not update icons. Source: web.dev "How Chrome handles updates to the web app manifest", 2024-09-19, https://web.dev/articles/manifest-updates. **The lesson: get icons and name right before testers install.**
- **Samsung Internet bug (current):** on Android 14 and up, WebAPKs minted by Samsung Internet are blocked with "Blocked dangerous app. This app is built for an older version of Android". Chrome on the same device works. The report was filed 2026-04-10 and was still open with new reports on 2026-08-31; Samsung said on 2026-07-24 it is "waiting for the team". Source: https://github.com/SamsungInternet/support/issues/123. **Action:** detect Samsung Internet (`/SamsungBrowser/` in the UA) and show "For the best install, open connectvibe.app in Chrome" instead of the Samsung install button.

---

## (b) Notification permission UX

### Plain English
Browsers punish sites that ask for notifications too early or send notifications nobody opens. Chrome may hide our prompt entirely, give us a smaller one, or later take the permission away. The fix is behavioural. Ask only when the student has just done something that makes notifications obviously useful, such as sending a DM, RSVPing to an event or joining a club. Explain first in our own UI. Send few, high-value notifications. Installed apps get extra protection from auto-revocation.

### What Chrome does today
- **Quieter permission UI (since Chrome 80, Jan 2020):** for users who usually deny, and for sites with very low accept rates, the prompt collapses into a small bell icon in the address bar. Source: https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html.
- **Abusive prompts and notifications (since Chrome 84, July 2020):** sites with misleading prompts, content blocked until you allow, or fake-chat, phishing or malware notifications are auto-enrolled in the quiet UI. Source: same Chromium blog series.
- **Lighter Android prompt, Chrome 155+:** a small non-blocking chip with Allow and Manage that **times out**. A timeout returns `permission = 'default'`, not `'denied'`, so our code must treat "default after prompt" as "not now". The same post tells sites to watch permission changes with the Permissions API, because users can also enable notifications from Site Controls without our prompt. Source: https://developer.chrome.com/blog/notification-prompts-android, **2026-07-22**.
- **Auto-revocation:** Chrome on Android and desktop removes notification permission from sites with "very low user engagement and a high volume of notifications". "**This feature does not revoke notifications for any installed web apps.**" Users can restore it via Safety Check. Source: https://blog.google/chromium/automatic-notification-permission/, 2025-10-10.
- **2026 hardening:** revocation for sites with repeated "suspicious notification" warnings, on-device ML spam warnings on notification content, one-tap unsubscribe, and FCM throttling of disruptive sites to **1,000 messages per minute** (HTTP 429), escalating for repeat offenders. Source: Google Security blog, **2026-08-11**, https://blog.google/security/the-multi-layered-defenses-that-harden-chrome-against-abusive-notifications/. PushAlert (a vendor blog, 2026-02-27) also claims penalty windows of 1, 7 and 14 days and recovery after 42 clean days, https://pushalert.co/blog/google-chrome-rate-limits-spam-protection-permission-removal/. That is **UNVERIFIED** against a Google primary source.

### Best practice for Vibe
Source: web.dev "Permission UX", updated 2025-03-26, https://web.dev/articles/push-notifications-permissions-ux.
1. **Never prompt on load.** "The worst thing you can do is to show the permission dialog to users as soon as they land on your site."
2. **Double permission (soft pre-prompt):** use our own card first ("Want a ping when someone replies?" with **Turn on** and **Not now**). Call `Notification.requestPermission()` only from the **Turn on** click, which also satisfies the user-gesture requirement in Firefox and Safari.
3. **Good moments for Vibe:** right after sending the first DM, after RSVPing or saving an event (reminder value), after joining or following a club, and on Android right after `appinstalled`.
4. **Put a permanent toggle in Settings** (Notifications: on or off, plus per-type switches) and explain how to turn notifications off. Revocation should be one tap for us too: unsubscribe and delete the row.
5. **Handle every state:** `granted` means subscribe and POST the subscription to the server. `denied` means hide the ask and show "blocked in browser settings" help text. `default` after a prompt means a timeout or dismissal, so back off for days, not minutes.
6. **Ask from the top-level page, not from inside the `/html/*.html` iframes** that the messages and onboarding shells embed (next.config.ts:50-58 comment). Chrome restricts permission prompts from iframes; for same-origin frames the exact behaviour is **UNVERIFIED**, so avoid the question.
7. **Android 13+ OS permission:** Android 13 added a runtime `POST_NOTIFICATIONS` permission. How Chrome and WebAPK surface it (a combined OS prompt versus a second prompt) is **UNVERIFIED** from primary sources. Test on a real Android 13+ phone, both in the browser and installed.

---

## (c) Web Push, server side

### Plain English
When a student allows notifications, their browser hands us a **subscription**: a secret URL at Google, Mozilla, Apple or Microsoft, plus two keys. To notify them, our server encrypts a small message (about 4 KB maximum) with those keys, signs the request with **our** VAPID key, and POSTs it to that URL. The push service keeps it until the phone is reachable, for up to the TTL we set. If the service answers "404" or "410", the subscription is dead and we delete it. Our VAPID key is like the lock the subscriptions were cut for: **if we ever change it, every existing subscription stops working.**

### VAPID (RFC 8292, Nov 2017, https://www.rfc-editor.org/rfc/rfc8292)
- An ECDSA P-256 key pair, signed ES256. The header is `Authorization: vapid t=<JWT>, k=<base64url public key>`.
- JWT claims: `aud` is the **origin of the push endpoint** (e.g. `https://fcm.googleapis.com`). `exp` must be ≤ 24 h ahead. `sub` is a contact `mailto:` or `https:` URI.
- A subscription created with `applicationServerKey = our public key` is **bound** to that key. A mismatched or missing VAPID key gets a 403. "Application servers need to remember the key that was used" (RFC 8292). Rotating keys means re-subscribing every user. Source also: web.dev "The Web Push Protocol", updated 2024-09-20, https://web.dev/articles/push-notifications-web-push-protocol.
- **Apple-specific:** a `sub` pointing at localhost (e.g. `mailto:x@localhost`, `https://localhost`) is rejected with **403 BadJwtToken** while FCM accepts it. Sources: web-push issue #947 and README note (PR #988 merged 2026-09-11), https://github.com/web-push-libs/web-push/issues/947. **Use `mailto:` with a real domain address, or `https://www.connectvibe.app`.**
- **Apple also says "Don't refresh your JWT more frequently than once per hour."** Source: Apple Developer, "Sending web push notifications in web apps and browsers" (undated; fetched 2026-09-24 via the docs JSON), https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers. `web-push` 3.6.7 signs a **new JWT on every send** (src/web-push-lib.js `generateRequestDetails` → `vapidHelper.getVapidHeaders`, with a 12 h exp). Whether Apple actually throttles that for web push is **UNVERIFIED**; it works widely in practice. The cheap mitigation is to cache one `Authorization` header per endpoint origin for about 1–12 h. web-push allows this by passing `vapidDetails: null` plus `headers: { Authorization }`, because falsy `vapidDetails` is explicitly allowed (web-push v3.6.7 `src/web-push-lib.js:159-160`; the per-send JWT is built at `:278`).
- **Generation:** `npx web-push generate-vapid-keys` (or `webpush.generateVAPIDKeys()`) outputs base64url public and private keys. Next.js's PWA guide (docs v16.3.6, updated 2026-07-30, https://nextjs.org/docs/app/guides/progressive-web-apps) uses these env names:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: public, used by the browser as `applicationServerKey`.
  - `VAPID_PRIVATE_KEY`: **server only, never `NEXT_PUBLIC_`**. Store it in Vercel as a Sensitive env var.
  - `VAPID_SUBJECT`: our addition, e.g. `mailto:<a real address on connectvibe.app>`.
  - **Use one key pair across Production, Preview and local**, or subscriptions created on one environment 403 on another. Prod and preview share the same Supabase subscription table unless we separate them.

### Encryption (RFC 8291, Nov 2017, https://www.rfc-editor.org/rfc/rfc8291)
- `Content-Encoding: aes128gcm`, a single record. The push service must accept a body of 4096 bytes, and the 86-byte header + 16-byte tag + 1 pad byte leave **at most 3993 bytes of plaintext**.
- The legacy `aesgcm` encoding (a draft) is not accepted by Apple. `web-push` 3.6.7 defaults to `aes128gcm` (web-push v3.6.7 `src/web-push-lib.js:111`; default TTL at `:13`). `@block65/webcrypto-web-push` 1.x sent `aesgcm` and only 2.0.0 (2026-09-03) fixed that.
- **Payload rule for Vibe:** send small JSON (title, body, url, tag, badge count, ids), never full message text beyond a preview. Keep it under ~3 KB to leave headroom. Mozilla's docs say payloads bridged through FCM are limited to about **2744 bytes** (autopush docs, https://mozilla-services.github.io/autopush-rs/http.html, undated). That argues for **≤ 2 KB of JSON**.

### Headers (RFC 8030, Dec 2016, https://www.rfc-editor.org/rfc/rfc8030)
- **`TTL` (required, seconds):** a missing TTL gets a 400. `TTL: 0` means deliver now or drop. Push services may shorten it. Apple stores for up to 30 days; Mozilla's old docs cap it at 2,592,000 s (30 days). web-push's default is **4 weeks (2419200)**, which is too long for a social app.
  - Vibe TTLs: DM, 1 day. Like, follow or comment, 1 day. Event reminder, until the event starts. Moderation notice, 7 days.
- **`Urgency`:** `very-low | low | normal | high`, default normal. Use `high` for DMs and time-bound event reminders, `normal` for social activity, `low` for digests.
- **`Topic`:** ≤ 32 chars of base64url. A new message with the same topic **replaces** an undelivered one. Use it for coalescing, e.g. `dm-<threadIdShort>` so an offline phone gets one "3 new messages" instead of three.
- Responses and what to do:
  - **201**: success.
  - **400**: bad headers or TTL. It's a bug; log it.
  - **403**: VAPID mismatch or bad JWT. It's config; alert.
  - **404 or 410**: the subscription is gone. **Delete the row.**
  - **413**: payload too large. It's a bug.
  - **429**: rate limited. Honour `Retry-After` and back off.
  - **5xx**: retry with backoff, a few times at most.
  Apple adds JSON `reason` codes (BadJwtToken, VapidPkHashMismatch, PayloadTooLarge, TooManyRequests, ...) per the Apple doc above.

### Push services Vibe will actually hit (by endpoint host)
| Browser | Endpoint host | Notes |
|---|---|---|
| Chrome, Samsung Internet, Opera (Android and desktop) | `fcm.googleapis.com` | VAPID web push is **not** affected by the 2024 FCM legacy-API shutdown (Firebase list thread, https://groups.google.com/g/firebase-talk/c/3C2Vq9pIWr4). |
| Firefox | `updates.push.services.mozilla.com` | autopush. Router records expire after 60 days without check-in. |
| Safari / iOS home-screen apps | `web.push.apple.com` (allow `*.push.apple.com`) | Needs SNI and TLS. ≤ 100 unacknowledged pipelined HTTP/1.1 requests per connection. |
| Edge (Windows) | `*.notify.windows.com` (WNS) | Supports RFC 8030/8291/8292. **The exact endpoint pattern and limits are UNVERIFIED.** |

**Rate limits:**
- **FCM:** for disruptive sites only, Chrome/FCM throttle to 1,000 msgs/min (Google, 2026-08-11). FCM's general device limit ("240/min, 5,000/h per device", project limit 600k/min, page updated 2026-09-24, https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas) is written for native FCM; whether it applies to VAPID web push is **UNVERIFIED**.
- **Apple:** 429 TooManyRequests for "too many consecutive requests to the same device token", with no numeric limit published.
- **Mozilla** and **WNS**: no published numbers (**UNVERIFIED**).
- At Vibe's scale (hundreds to low thousands of students) none of these bind. **Our own per-user cap binds first** (see checklist).

**Security note (my recommendation, not a cited source):** the endpoint URL comes from the client, and the server POSTs to it. That is an SSRF surface. On subscribe, **reject any endpoint that is not `https:`** or whose host is not in {`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`}. Cap the stored JSON size and `keys` lengths too (p256dh is 65 bytes → 87 base64url chars; auth is 16 bytes → 22 chars).

### Library choice for a Node.js Vercel function
Checked 2026-09-24 against the npm registry (`npm view`) and the GitHub API.

| Package | Latest (date) | Node engine | Runtime | Notes |
|---|---|---|---|---|
| **`web-push`** | **3.6.7 (2024-01-16)** | `>= 16` | Node only (`node:crypto` ECDH, `https.request`) | ~6.7M downloads/week. MPL-2.0. Repo is **active** (commits 2026-09-11; ESM-only migration and class refactor merged 2026-07-22) but has **no npm release since Jan 2024**. Issue #978 "No Releases Since 3 Years Ago" (2026-08-01) has no maintainer reply. Types come from `@types/web-push` 3.6.4. Used by the official Next.js PWA guide. |
| `@block65/webcrypto-web-push` | 2.0.0 (**2026-09-03**) | `>= 22` | Web Crypto (Node, Workers, Deno, Bun) | MIT, 44 stars. 1.x used `aesgcm` + the draft auth scheme, **which Apple rejects**; 2.0 is three weeks old. Pads every message to 4096 bytes (hides the length; max payload 3993). Has an e2e suite against real push services. ESM-only. |
| `@pushforge/builder` | 2.0.5 (2026-04-23) | `>= 20` | Web Crypto, zero deps | MIT, 65 stars. Builds `{endpoint, headers, body}` for `fetch`. Works on Edge, Workers and Deno. |
| `@mmmike/web-push` | 1.3.0 (2026-08-14) | `>= 22.12` | ESM fork | A small community fork. **UNVERIFIED** quality. |

**Known issues with `web-push` 3.6.7 that matter to us:**
- **Node 24 prints a DEP0169 `url.parse()` deprecation warning** (issue #943). It's harmless. The fix (#945) is on master but not released. Vercel's default Node is **24.x**; 22.x and 20.x are also offered, and **Node 20 is deprecated on Vercel on 2026-10-01** (Vercel docs, updated 2026-02-27, https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Vibe's `package.json` pins no `engines`, so the Node version comes from the Vercel project settings. **Check that it isn't still set to 20.x.**
- **It won't run on the Edge runtime or in the browser** (issue #907, "URL is not a constructor"; the fix was "switch to the Node.js runtime"). Next 16 route handlers default to Node, so **never import it from a client component or `runtime = 'edge'`**. Guard it with `import 'server-only'` (already a dependency, `package.json:36`).
- If an `Urgency` header is passed via `headers`, it gets overwritten (open PR #980). Use the top-level `urgency` option instead.
- A **new JWT on every send**. See the Apple note above; cache the header if we ever see 429 or 403 from Apple.
- Supabase Edge Functions run on Deno. Whether `web-push` works there is **UNVERIFIED** (it needs `node:crypto` `createECDH`). If the push sender moves into a Supabase Edge Function, use `@pushforge/builder` or `@block65/webcrypto-web-push` 2.x instead.

### Declarative Web Push from the same server code
- **What it is:** a push payload that the browser itself can turn into a notification without running our service worker. Shipped in Safari/iOS **18.4** (March 2025) and macOS 15.5. The W3C Push API editor's draft now defines it (https://w3c.github.io/push-api/, last commit 2025-12-01). Chrome and Firefox **have not shipped it**. There is a Chromium tracking bug, https://issues.chromium.org/issues/382298314, whose status is **UNVERIFIED**. Mozilla's standards position is positive. Sources: WebKit blog, 2025-03-27, https://webkit.org/blog/16535/meet-declarative-web-push/; Aimtell, April 2026, https://aimtell.com/blog/state-of-declarative-web-push-2026.
- **The shape:** the spec's declarative push message is JSON with required `"web_push": 8030` and `"notification": { "title", "navigate" }`, plus optional `body`, `tag`, `icon`, `badge`, `image`, `lang`, `dir`, `silent`, `data`, `timestamp`, and `app_badge` and `mutable` at the top level.
- **Server side it is just the payload string.** The spec says the user agent "opportunistically parses each incoming push message", so **no special header is required**. It uses the same aes128gcm encryption and the same `webpush.sendNotification(sub, JSON.stringify(payload), opts)`.
  - The WebKit explainer had proposed `Content-Type: application/notification+json`, and a 2026 vendor blog still says to set it. That is harmless to add via `headers`, but not needed per the current spec. **UNVERIFIED** whether Safari still looks at it.
- **Recommendation: send one payload format to every browser.** Every Vibe push is the declarative shape. The Chrome, Firefox and Edge service worker `push` handler parses it and calls `showNotification(n.title, {...n, data: {url: n.navigate, ...}})`. Safari can render it even if the SW was evicted. Set `mutable: false`, since we don't need the SW to rewrite anything.

---

## (d) Badging API

### Plain English
On Windows and Mac we can put an unread count on the Vibe app icon. On Android we can't set a number. Android puts a dot on the icon automatically whenever Vibe has an unread notification in the tray.

- `navigator.setAppBadge(n)` / `clearAppBadge()`. Also available in the service worker (`self.navigator`), so the `push` handler can set the count.
- **Chrome and Edge desktop:** Windows and macOS (Chrome 81+). **Installed apps only.** No permission is needed to set a badge, but updating it in the background from push needs notification permission (a push must show a notification). Source: https://developer.chrome.com/docs/capabilities/web-apis/badging-api (2018-12-11, still current per MDN).
- **Android Chrome:** "Android doesn't support the Badging API". Android "automatically shows a badge on app icon for the installed web app when there is an unread notification" (same source). Calling `setAppBadge` there should be feature-detected and never assumed to work.
- **Safari/iOS 16.4+ home-screen apps:** supported. Users control it in Notifications settings (Apple doc above). Declarative push can carry `app_badge`.
- **Firefox:** not supported. Source: MDN Badging API, modified 2024-07-25, https://developer.mozilla.org/en-US/docs/Web/API/Badging_API.
- **For Vibe:** badge = unread DMs + unread notifications. Put the count in every push payload (`app_badge`), set it in the SW on `push`, and clear or update it whenever the app reads `public.notifications` or messages.

---

## (e) notificationclick: focus an existing window, or open the deep link

### Plain English
When a student taps a notification, we want the right screen: the DM thread, the event, the post. If Vibe is already open, we should reuse that window rather than stack a second copy. On Android, an installed Vibe opens in the app, not in a Chrome tab, as long as the link is inside the app's scope.

- **Pattern** (web.dev "Common notification patterns", 2016-06-30, still the canonical reference, https://web.dev/articles/push-notifications-common-notification-patterns):
  1. `event.notification.close()`.
  2. `const url = new URL(event.notification.data.url, self.location.origin).href`.
  3. `event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(...))`.
  4. If a client is already on that URL, call `client.focus()`.
  5. Otherwise, if any Vibe client exists, call `client.focus()` and then `client.navigate(url)` (**controlled clients only**, MDN `WindowClient.navigate`, modified 2026-05-22), or `postMessage` it so the React router navigates without a full reload.
  6. Otherwise call `clients.openWindow(url)`.
- `clients.openWindow()` needs transient activation, which a notification click provides. Firefox allows popups only from notification clicks. The URL must be same-origin (anything else resolves `null`). On Chrome for Android and Windows it "may instead open the URL in an existing browsing context provided by a standalone web app". Source: MDN `Clients.openWindow`, modified 2026-09-12, https://developer.mozilla.org/en-US/docs/Web/API/Clients/openWindow.
- **Deep-link rules for Vibe:**
  - Only put **relative, same-origin** paths in `data.url` / `navigate`. Validate them in the SW before opening; never open a URL taken blindly from a payload. Real routes that exist today:
    - `/messages?to=…` or `/messages?channel=…` (`src/app/messages/page.tsx:26` reads `to` and `channel`)
    - `/posts/<id>` (`src/app/posts/[id]/page.tsx`)
    - `/orgs/<handle>` (`src/app/orgs/[handle]/page.tsx`)
    - `/profile/<handle>` (`src/app/profile/[handle]/page.tsx`)
    - There is **no `/events` route** in `src/app` today, so event reminders need a target decided.
  - The target route must pass `src/proxy.ts`'s gates for a signed-in user and must be inside the manifest `scope`.
  - For messages, open the **React route** `/messages` (`src/app/messages/MessagesSwitch.tsx` frames `/html/messages.html` on desktop), not the raw `/html/...` file, so desktop and mobile behave the same.
- **Every push must show a notification.** Chrome shows "This site has been updated in the background" if the `push` handler does not show one before its `waitUntil` promise settles. Source: web.dev "Handling messages", 2016-06-30, https://web.dev/articles/push-notifications-handling-messages. Subscriptions must use `userVisibleOnly: true`. **Never send "silent" data-only pushes.** If a DM push arrives while that thread is focused, still show the notification (with `silent: true`), or better, suppress it on the server when the user is actively in the thread.
- Use a `tag` per thread plus `renotify: true` for DMs, so a thread's notifications replace each other instead of piling up.
- Add `launch_handler: {client_mode: ["navigate-existing","auto"]}` (section a) so that launching from the icon or a link also reuses the open window.
- `pushsubscriptionchange`: Firefox can rotate subscriptions. Handle the event by re-subscribing with the same key and POSTing the old and new subscription to the server. It is not Baseline, so also **re-sync the subscription on every app start** (`pushManager.getSubscription()`, then upsert on the server). Source: MDN, modified 2025-09-18, https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event.

---

## (f) Firefox install status (desktop and Android)

### Plain English
Firefox is the odd one out. You can't install Vibe as a real app from Firefox on a Mac, and on Android Firefox makes a shortcut that opens in the browser. **Push notifications work in Firefox on both desktop and Android** without installing. So for Firefox users, "turn on notifications" matters more than "install".

- **Firefox desktop:** "Firefox does not support installing PWAs using a manifest file" (MDN, modified 2026-09-07). Separately, Firefox has **"Web Apps" (taskbar tabs)**: an "Add tab to taskbar" button that pins a site-styled browser window. It is **Windows only** and on by default there (MSIX and non-MSIX). It is off by default on Linux and "not available" on macOS. Mozilla says they "still appear like a browser". The docs don't mention manifest-driven behaviour, `beforeinstallprompt` or badging. Source: Firefox Source Docs "Web Apps in Firefox" (undated; fetched 2026-09-24), https://firefox-source-docs.mozilla.org/browser/components/taskbartabs/docs/index.html. Which Firefox release first shipped it (142 per gHacks, 2025-08-22) is **UNVERIFIED**.
- **Firefox Android:** "Firefox, Edge, Opera, and ... Chrome on devices where GMS is not present ... add a browser-badged home-screen shortcut that opens the site in the browser" (MDN, modified 2026-09-07). There is no WebAPK and no `beforeinstallprompt`. MDN's Installing guide (modified 2026-09-17) even says Firefox "requires a PWA extension". Treat Firefox as **not installable** for planning.
- Firefox has no Badging API and no Declarative Web Push. Push works via autopush (`updates.push.services.mozilla.com`). Firefox requires a user gesture for `requestPermission()`; the soft pre-prompt button satisfies it.
- **Install coaching for Vibe:**
  - Firefox and Edge on Android: suggest "Open in Chrome to install".
  - Firefox desktop: don't show an install button; show the notifications toggle instead.
  - Samsung Internet: point users to Chrome until the Android 14 WebAPK bug is fixed (section a).
  - iOS: handled by the iOS research file.

---

## 5. Vibe repo facts that affect this (checked 2026-09-24, read-only)

- **No manifest, no SW, no push code, no VAPID env.** A grep for `push_subscription|web_push|vapid` across `supabase/`, `src/` and `public/html/` found nothing, and `.env.example` has no VAPID keys.
- **The proxy already expects a SW and a manifest.** `src/proxy.ts:84-98` lists `js`, `json` and `webmanifest` as asset extensions and says it does this so "any service worker we add later" isn't answered with an HTML redirect. The matcher (`src/proxy.ts:314-318`) still *runs* on `/sw.js` and `/manifest.webmanifest`, so **verify with anonymous curl** that both return 200 with the right content type (`application/javascript`, `application/manifest+json`) and are never redirected to sign-in.
- **There is no CSP yet** (`next.config.ts:39-41`), so no `worker-src` change is needed. If a CSP is added later, include `worker-src 'self'`. Add `/sw.js` headers of `Cache-Control: no-cache` (Next.js guide) and optionally `Service-Worker-Allowed: /`.
- **Icons:** `src/app/icon.png` is 192×192 and `src/app/apple-icon.png` is 180×180. **There is no 512 and no maskable icon.** The theme colour is `#FAF7F2` (`src/app/layout.tsx:31`), with `viewportFit: "cover"` (`:30`).
- **In-app notifications already exist.** `public.notifications` (`supabase/migrations/20260504150000_notifications.sql:12-21`) has rows written only by SECURITY DEFINER triggers (`:1-10`; grants tightened in `20260922120000_t2_notification_writes_and_helper_grants.sql:396`). Push should be a **delivery channel for these rows** (plus DMs), not a second notification system.
- **Nothing server-side reacts to a row yet.** There is no `vercel.json` cron and no `supabase/functions/`, so the push fan-out trigger is a design decision (see Decisions).
- **Runtime:** `package.json` has `server-only` (`:36`) and `@types/node ^20`, and **no `engines` field**. The Vercel Node major comes from project settings, and Node 20 is deprecated on Vercel on 2026-10-01.

---

## 6. Server-side push checklist for Vibe

1. **Keys:** run `npx web-push generate-vapid-keys` **once**. Store `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Sensitive) and `VAPID_SUBJECT` (a real `mailto:` on our domain, **not localhost**) in Vercel for Production, Preview and Development, all the same pair. Write the pair into the founders' password manager too. **Losing or rotating it kills every subscription.**
2. **Table `push_subscriptions`:**
   - Columns: `id`, `user_id` (FK users, ON DELETE CASCADE), `endpoint` (text UNIQUE), `p256dh`, `auth`, `user_agent` / `platform` (`android-chrome`, `desktop-chrome`, `edge`, `firefox`, `samsung`, `ios`), `installed` (bool, from `display-mode`), `created_at`, `last_success_at`, `failure_count`.
   - RLS: the owner can select and delete their own rows. **Inserts and updates go only through a server route using the service role**, which fits the project's "grants not routes" model.
3. **Subscribe route** (`POST /api/push/subscribe`, Node runtime, signed-in only):
   - Validate that the endpoint is `https:` with a host in the allow-list (FCM, Mozilla, Apple, WNS), and that key lengths are sane (p256dh 87 chars, auth 22 chars, base64url).
   - Upsert on `endpoint`, **re-pointing `user_id`** if a different account signs in on the same browser.
   - Rate-limit it with the existing DB rate limiter.
4. **Unsubscribe route:** delete by `endpoint` for the current user, and call it from the Settings toggle and on sign-out. On sign-out, also `subscription.unsubscribe()` in the browser, **so the next person on a shared laptop doesn't get the previous user's DMs.**
5. **Sender module** (`src/lib/push/send.ts`, starting with `import 'server-only'`):
   - Wrap `webpush.sendNotification(sub, payload, { TTL, urgency, topic, timeout: 10_000 })`.
   - Map results: 201 means update `last_success_at`. **404 or 410 means delete the row.** 413 or 400 means log it as a bug. 403 means alert (config or VAPID mismatch). 429 or 5xx means increment `failure_count`, honour `Retry-After`, retry at most twice, and delete after N consecutive failures.
6. **Payload:** one declarative-compatible shape for every browser, kept ≤ 2 KB:
   `{"web_push":8030,"notification":{"title","body","navigate":"/messages?to=…","tag","icon","badge","silent":false,"data":{…}},"app_badge":N,"mutable":false}`
   **Privacy:** DM bodies show a short preview, never full text. There is no content from hidden or private clubs to people who can't see it; re-check visibility at send time, not at queue time. Previews respect a future "hide previews" setting.
7. **TTL, Urgency and Topic per type:**

   | Type | TTL | Urgency | Topic |
   |---|---|---|---|
   | DM | 86400 | high | `dm-<thread>` (keep the whole Topic ≤ 32 base64url chars; a UUID is 36, so strip hyphens and truncate) |
   | Like, follow, comment | 86400 | normal | `act-<user>` (coalesces) |
   | Event reminder | until event start | high | — |
   | Moderation notice | 604800 | normal | — |

8. **Fan-out trigger:** in-app rows are written by DB triggers. Options: (a) a Supabase Database Webhook or `pg_net` call to a signed Vercel route on `notifications` INSERT; (b) an outbox table drained by a Vercel cron every minute; (c) send inline from the API routes that already create DMs, mentions and so on. **Whichever is chosen, authenticate the internal call** (shared secret or HMAC) and make it idempotent (a `pushed_at` column).
9. **Send off the request path:** use Next's `after()` or a queue so a slow push service never delays the user's action. Run sends to one user's several devices in parallel with `Promise.allSettled`.
10. **Our own anti-spam caps**, well below browser enforcement:
    - Per user, at most N pushes per hour (e.g. 10) with digest fallback.
    - No pushes for your own actions.
    - Respect per-type toggles and quiet hours (e.g. 11pm–8am local, except DMs).
    - Collapse likes ("Maya and 4 others liked your post").
    Chrome revokes permission for high-volume, low-engagement senders (section b).
11. **Moderation tie-in:** suspended or banned users get no social pushes but **do** get the moderation-outcome push. Pushes about a removed post or comment are dropped at send time.
12. **Observability:** Sentry breadcrumb per send (status code only; **never log endpoints or keys**, because the endpoint is a bearer capability), plus a daily count of 404/410 cleanups.
13. **Test matrix before testers:** Android Chrome (browser tab + installed WebAPK, Android 13+ OS permission), Samsung Internet (expect the Android 14 WebAPK block), desktop Chrome and Edge (Windows and Mac), Firefox desktop and Android, and iOS home-screen (separate file). For each, check: receive while closed, click opens the right deep link, badge, unsubscribe, and sign-out handoff.

---

## 7. Library recommendation

**Use `web-push` 3.6.7, pinned exactly** (`"web-push": "3.6.7"`) with `@types/web-push` as a dev dependency, inside a small `server-only` wrapper.

Why:
1. **It does exactly what we need:** aes128gcm by default, VAPID `vapid t=,k=` scheme, TTL, Urgency and Topic options, a `timeout`, and a `WebPushError` carrying `statusCode`/`body` for 404/410 cleanup.
2. **Most proven in production.** It has about 6.7M weekly downloads and is the library in the official Next.js 16 PWA guide (2026-07-30), so it is the most-trodden path for Next on Vercel.
3. **Maintained enough.** The repo is maintained and was touched this month (dependabot, Firefox CI, the Apple-localhost doc fix), even though npm hasn't had a release since 2024-01. The protocol is frozen (RFCs from 2016–2017), so "no new release" matters less here than it would for most dependencies.
4. **Works on every Vercel Node major** (engine `>= 16`): 20, 22 and 24. The only cost on Node 24 is one DEP0169 warning.
5. **Declarative Web Push needs nothing from the library.** It is just the JSON we pass as the payload.

Wrap these gotchas:
- Always pass `TTL` explicitly (the default is 4 weeks).
- Pass `urgency` as an option, not a header.
- Pass `timeout`.
- Never import from client or edge code.
- Real `mailto:` subject.
- Optionally cache the VAPID `Authorization` header per push-service origin (see the Apple note).

**When to switch instead:**
- If the sender must run in a **Supabase Edge Function (Deno)**, **Cloudflare**, or the **Vercel Edge runtime**, use `@pushforge/builder` (Node ≥ 20, zero deps, Web Crypto). It has been stable since April 2026.
- `@block65/webcrypto-web-push` **2.x** is well designed: constant 4096-byte padding and a real-push-service e2e suite. But 2.0.0 is only three weeks old (2026-09-03), requires Node ≥ 22, and its 1.x line sent the Apple-incompatible `aesgcm`. Re-evaluate it after launch.
- If `web-push` 4.x ships (ESM-only per master), upgrade after launch, not before.

---

## Decisions for Franky (also in the structured summary)

1. **Where does fan-out run?** The options are a DB webhook to a Vercel route, an outbox plus Vercel cron, or inline in API routes. The recommendation is **an outbox table + webhook to a signed Vercel route**: idempotent, retryable, and it keeps `web-push` on Node.
2. **Which notifications push at launch?** The recommendation is **DMs, event reminders and moderation outcomes on by default**. Likes, follows and comments start **off by default, or as a batched digest**, to protect engagement ratios.
3. **Samsung Internet:** coach to Chrome, or accept the blocked-install risk. The recommendation is to coach to Chrome.
4. **Share target and origin-trial install APIs:** the recommendation is to defer both to after Oct 31.

## Open questions (not resolved by sources)
- Does Chrome 15x still require a non-empty `fetch` handler for the automatic install prompt, or for `beforeinstallprompt`? (The last official word is 2023-12-05.)
- How exactly does WebAPK plus Android 13+ `POST_NOTIFICATIONS` present to users? This needs a device test.
- Do Apple's "no more than one JWT refresh per hour" rule and FCM's per-device quotas actually bite web push at Vibe's volume?
- What are the exact WNS endpoint host patterns and limits for Edge web push?

---

## 8. Sources (with published or updated dates)

**Chrome / Google**
- web.dev install criteria, 2024-09-19: https://web.dev/articles/install-criteria
- Chrome blog, installability criteria update, 2023-12-05: https://developer.chrome.com/blog/update-install-criteria
- Richer Install UI, 2026-09-16: https://web.dev/articles/web-apps/richer-install-ui (and https://developer.chrome.com/blog/richer-pwa-installation, 2021-04-23)
- Manifest `id`, 2024-09-20: https://developer.chrome.com/docs/capabilities/pwa-manifest-id
- Manifest updates / WebAPK, 2024-09-19: https://web.dev/articles/manifest-updates
- Maskable icons, 2019-12-19: https://web.dev/articles/maskable-icon
- `<install>` element OT, 2026-05-12: https://developer.chrome.com/blog/install-element-ot
- Web Install API OT, InfoQ, 2026-03-27: https://www.infoq.com/news/2026/03/web-install-api-origin-trial
- Lighter Android prompts (Chrome 155), 2026-07-22: https://developer.chrome.com/blog/notification-prompts-android
- Auto-revocation, 2025-10-10: https://blog.google/chromium/automatic-notification-permission/
- Abuse defenses, 2026-08-11: https://blog.google/security/the-multi-layered-defenses-that-harden-chrome-against-abusive-notifications/
- Quieter UI, 2020-01: https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html
- Permission UX, 2025-03-26: https://web.dev/articles/push-notifications-permissions-ux
- Web Push Protocol, 2024-09-20: https://web.dev/articles/push-notifications-web-push-protocol
- Handling messages, 2016-06-30: https://web.dev/articles/push-notifications-handling-messages
- Common patterns, 2016-06-30: https://web.dev/articles/push-notifications-common-notification-patterns
- Badging, 2018-12-11: https://developer.chrome.com/docs/capabilities/web-apis/badging-api
- Web Share Target, 2019-11-08: https://developer.chrome.com/docs/capabilities/web-apis/web-share-target
- FCM quotas, 2026-09-24: https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas

**MDN**
- Making PWAs installable, 2026-09-07: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Installing, 2026-09-17: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing
- `beforeinstallprompt`, 2026-07-28: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event
- `launch_handler`, 2025-11-13: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler
- `openWindow`, 2026-09-12: https://developer.mozilla.org/en-US/docs/Web/API/Clients/openWindow
- `WindowClient.navigate`, 2026-05-22: https://developer.mozilla.org/en-US/docs/Web/API/WindowClient/navigate
- `pushsubscriptionchange`, 2025-09-18: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event
- Badging, 2024-07-25: https://developer.mozilla.org/en-US/docs/Web/API/Badging_API

**RFCs**
- RFC 8030 (2016-12): https://www.rfc-editor.org/rfc/rfc8030
- RFC 8291 (2017-11): https://www.rfc-editor.org/rfc/rfc8291
- RFC 8292 (2017-11): https://www.rfc-editor.org/rfc/rfc8292

**Apple / WebKit / W3C**
- Apple web push server doc (undated, fetched 2026-09-24): https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- WebKit Declarative Web Push, 2025-03-27: https://webkit.org/blog/16535/meet-declarative-web-push/
- W3C Push API ED (last commit 2025-12-01): https://w3c.github.io/push-api/
- WebKit explainer: https://github.com/WebKit/explainers/blob/main/DeclarativeWebPush/README.md
- Aimtell, 2026-04: https://aimtell.com/blog/state-of-declarative-web-push-2026

**Mozilla / Samsung / Vercel / Next**
- Firefox Web Apps docs (fetched 2026-09-24): https://firefox-source-docs.mozilla.org/browser/components/taskbartabs/docs/index.html
- autopush (undated): https://mozilla-services.github.io/autopush-rs/http.html
- Samsung WebAPK bug #123 (2026-04-10, active 2026-08-31): https://github.com/SamsungInternet/support/issues/123
- Vercel Node versions, 2026-02-27: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Next.js PWA guide (v16.3.6), 2026-07-30: https://nextjs.org/docs/app/guides/progressive-web-apps

**Libraries**
- npm registry via `npm view`, 2026-09-24:
  - web-push 3.6.7 (2024-01-16)
  - @block65/webcrypto-web-push 2.0.0 (2026-09-03)
  - @pushforge/builder 2.0.5 (2026-04-23)
  - @mmmike/web-push 1.3.0 (2026-08-14)
  - @types/web-push 3.6.4
- web-push GitHub, issues #907, #943, #947, #978, #980 and commit log to 2026-09-11: https://github.com/web-push-libs/web-push
