# iPhone/iPad rules for installable web apps — September 2026

Research pass for the Vibe PWA wave. Researched 2026-09-24. Read-only; nothing in the repo was changed.
Current Apple releases: **Safari 27 / iOS 27 shipped September 14, 2026**; iOS 26.x (26.0 to 26.5) is the prior line.
Source: Safari 27 release notes, "Released September 14, 2026 — 27.0" (developer.apple.com/documentation/safari-release-notes/safari-27-release-notes, fetched 2026-09-24).

How to read this: every section starts in plain English, then gives the technical detail. Repo claims are `path:line`.
Web claims give a URL and the date that source was published. **UNVERIFIED** means I could not confirm it from a primary source,
or the only confirmation is old or third-party. Test those on a real iPhone before relying on them.

---

## Summary (plain English)

1. **Installing is manual, but easier than it was.** Since iOS 26, anything a student adds to the Home Screen opens as an app by default.
   There is no "Install" button we can trigger, so we have to show students the steps ourselves.
2. **iOS 27 changed nothing for web apps.** Neither the Safari 27 release notes nor the WebKit post about it mention
   web apps, push, the manifest or badging. What worked on iOS 26 still applies.
3. **Staying signed in works once.** When a student adds Vibe to the Home Screen, iOS copies Safari's cookies into the app,
   so a signed-in student stays signed in. After that the app and Safari are separate: signing out in one doesn't sign out the other.
4. **Email links never open the app.** A confirm or reset link in Mail opens Safari (or the student's default browser), not Vibe.
   Our 8-digit confirm code is the way to confirm from inside the app.
5. **Push notifications work, but only in the installed app, and only after a tap.** No Apple Developer account and no App Store are needed.
   Every push must show a visible notification, or iOS takes the permission away.
6. **iOS 18.4+ has "Declarative Web Push"**, where the phone draws the notification from JSON with no service-worker code.
   That removes the risk of losing permission over a push that showed nothing.
7. **Fullscreen polish has traps on iOS 26/27.** The `black-translucent` status bar is buggy there, `100vh` is the wrong height,
   there's no pull-to-refresh and no back button. We have to supply our own back and refresh controls.
8. **The EU is not a problem for us.** Apple threatened to remove Home Screen apps in the EU in 2024, then reversed it within weeks.

---

## (a) Installing on current iOS

### Plain English
On iOS 26 and 27 the student taps **… (More) → Share → Add to Home Screen → leaves "Open as Web App" on → Add**.
Nothing on our side can pop that up. Safari has no install prompt, so an in-app "how to install" sheet is the only lever we have.
Any site now opens as an app once added. A manifest still decides the name, icon, start page and which pages count as "inside the app".

### Steps Apple publishes today (iOS 27 and iOS 26 guide)
Apple Support, "Turn a website into an app in Safari on iPhone". Page versions: iOS 27 and iOS 26. Undated; fetched 2026-09-24.
https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- "Go to the website. Tap [More], then tap Share. If your Tabs layout is Bottom or Top, tap [Share]."
- "Scroll down the list of options, then tap Add to Home Screen." If it's missing: "Edit Actions, then tap Add to Home Screen."
- "Turn on Open as Web App. Tap Add." … "You can receive notifications from the web app."

### Rules and the iOS version each arrived in
| Rule | Since | Evidence |
|---|---|---|
| Any site added to the Home Screen opens as a web app by default. The "Open as Web App" switch is on by default, and turning it off makes a plain bookmark. "Zero requirements for installability." | iOS/iPadOS 26 | https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ (2025-09-15). Safari 26 notes: "Added support for any website to become a web app on iOS or iPadOS. (113034903)" |
| Before iOS 26, you needed `<meta name="apple-mobile-web-app-capable">` or a manifest `display` value to open standalone. | iOS 2.1 (meta) / 11.4 (manifest) | same WebKit post (2025-09-15) |
| Third-party browsers (Chrome, Edge, Firefox on iOS) can offer Add to Home Screen from their Share menu | iOS 16.4 | Safari 16.4 release notes (2023-03-27): "Added support for third-party browsers to offer Add to Home Screen from the Share menu." |
| Add to Home Screen from SFSafariViewController (the in-app Safari sheet some apps use) | iOS 17 | https://webkit.org/blog/14205/ (2023-06-06) |
| No install prompt API: `beforeinstallprompt` / `BeforeInstallPromptEvent` is unsupported | all | MDN browser-compat-data `api/Window.json`, `api/BeforeInstallPromptEvent.json` (main branch, commit of 2026-09-24): safari_ios `version_added: false` |
| Multiple installs of one app are distinguished by manifest `id` | iOS 16.4 | https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ (2023-03-27) |
| SVG and data-URL icons accepted everywhere, including Home Screen icons | iOS 26 | WebKit 17333 (2025-09-15) |

**In-app browsers:** Instagram, TikTok and Snapchat open links in their own web views. **UNVERIFIED:** I believe those web views have
no Add to Home Screen. Students arriving from an Instagram link would first have to tap "Open in Safari/browser".
That matters to us because Instagram is the platform we're replacing.

### What Safari reads: manifest vs `apple-*` tags
iOS support per MDN browser-compat-data, `manifests/webapp/*.json` (fetched 2026-09-24):
| Member / tag | iOS status | Note |
|---|---|---|
| `name`, `short_name`, `start_url`, `scope`, `display: standalone` | 11.3 | supported |
| `display: fullscreen`, `minimal-ui`, `display_override` | not supported | use `standalone` |
| `id` | 16.4 | stable app identity; set it explicitly (`"/"`) |
| `icons` | 15.4 | "Only used when no `apple-touch-icon` is present and `purpose` is `any` or unspecified" (BCD note). Same rule at https://webkit.org/blog/12445/ (2022-03-14): apple-touch-icon "takes precedence". |
| `theme_color` | 15 | Safari 26 stopped using theme-color to tint the browser toolbar (third-party: benfrain.com/ios26-safari-theme-color-tab-tinting-with-fixed-position-elements/, grooovinger.com/notes/2026-02-27-safari-26-header-background, 2026-02-27). Effect on a standalone app's status bar: **UNVERIFIED**. |
| `background_color` | not supported | iOS does **not** build a splash screen from the manifest |
| `orientation`, `shortcuts`, `share_target` | not supported | Share Target is WebKit bug 194593 (NEW, last touched 2026-05-23) |
| `<link rel="apple-touch-icon">` | all | the Home Screen icon iOS actually uses; 180×180 is the iPhone size |
| `<link rel="apple-touch-startup-image">` | all | the **only** way to get a launch (splash) image, one per device size/orientation (firt.dev/notes/pwa-ios, updated 2023-06-06). Still true on 26/27: **UNVERIFIED**, but no Apple note says otherwise. Without it the app shows a blank screen until first paint. |
| `<meta name="apple-mobile-web-app-status-bar-style">` | all | `default` \| `black` \| `black-translucent`. See the iOS 26/27 warning below. |
| `<meta name="apple-mobile-web-app-title">` | all | Home Screen label (the student can edit it). Exact precedence against manifest `short_name`: **UNVERIFIED**. |

**Icon guidance from Apple** (Safari 17.2 release notes, 2023-12-11, "Web Apps" section, written mostly about Mac web apps):
supply "at least one opaque, full-bleed `maskable` square icon … either as an SVG (any size) or high resolution bitmap (1024x1024)",
and "do not omit [apple-touch-icon] link elements based on user agent detection."

**Status-bar warning (iOS 26 and 27).** `black-translucent` combined with `viewport-fit=cover` misbehaves in standalone mode.
- WebKit bug 301108, "REGRESSION (iOS 26): `<meta name="viewport">` does not work correctly for viewport-fit=cover or height=device-height". Status NEW. Opened 2025-10-20, last changed 2026-07-26 (bugs.webkit.org REST, fetched 2026-09-24).
- Independent projects dropped `black-translucent` for `default` in September 2026:
  - github.com/frankely29/Frontend-github-pages-/pull/1142 (merged 2026-09-14): a status-bar-sized unpaintable strip at the bottom.
  - github.com/MrClit/fin-app/issues/411 (2026-09-17): on iOS 27 a Liquid Glass blur band covers about 35pt under the status bar.
- Third-party reports, **UNVERIFIED** by Apple. Recommendation: use `default`.

**Detecting "am I installed?"** `@media (display-mode: …)` is supported since iOS 12.2, but it's buggy.
MDN notes that an installed `display: standalone` app can match `fullscreen` instead of `standalone`
(WebKit bug 264218, NEW since 2023-11-11). Check `navigator.standalone === true` **or** `(display-mode: standalone)` **or** `(display-mode: fullscreen)`.

**Changes after install:** third-party reports say iOS keeps the launch settings from when the icon was added,
so changing status-bar style or icon may need a re-add (frankely29 PR #1142, 2026-09-14). **UNVERIFIED.** Get the manifest and icons right before the launch push.

---

## (b) Storage, sign-in and links between Safari and the installed app

### Plain English
- When a student adds Vibe to the Home Screen, iOS copies Safari's cookies into the new app. Our session lives in cookies, so a signed-in student opens the app already signed in.
- From then on, Safari and the app are two separate "browsers": sign-outs, drafts and saved settings don't carry across.
- Links in Mail, Messages or Instagram always open in Safari (or the student's default browser), never in the installed app.
  - If a student taps the signup-confirm email, **Safari** gets signed in, not the app.
  - Typing the 8-digit code inside the app is the clean path.
- The only door from outside into the app is a **tapped push notification**.
- Leaving the app for another site (Stripe Checkout) opens a Safari sheet over the app. Coming back to a connectvibe.app address should close the sheet and land back in the app. **Test this with Stripe before launch.**

### Detail
**Cookies are copied at install; nothing else is shared afterwards.**
- Safari 17.2 release notes (2023-12-11), Web Apps: "Added support for copying cookies when saving a website to the Home Screen on iOS and iPadOS. (104438319)".
- Apple's wording for Mac web apps (WWDC23 "What's new in web apps", developer.apple.com/videos/play/wwdc2023/10120/, June 2023):
  - "we copy website cookies … From that point on, cookies are separate between Safari and the web app."
  - "local storage is not copied when a web app is created".
- For iOS, localStorage not being copied is **UNVERIFIED**, but it's the same design, so assume it.

What this means for Vibe:
- The session is cookie-based: `src/lib/supabase/browser.ts:10` ("session stored in cookies via @supabase/ssr"), refreshed server-side on every request (`src/proxy.ts:17`, `src/proxy.ts:219`). So it survives the install copy.
- There are ~22 `localStorage.getItem/setItem` call sites in `src` and `public/html`. They start empty in the app. That's acceptable for per-viewer conveniences.
- Server-set cookies avoid Safari's 7-day cap on `document.cookie` cookies: "All persistent client-side cookies, i.e. persistent cookies created through document.cookie, are capped to a seven day expiry" (https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/, 2019-02-21). The proxy refresh keeps the session on the server-set path.
- Open bug to watch: WebKit 272325, "REGRESSION (iOS 17.x): Session cookies being reset randomly in a Home Screen web app". NEW, last changed 2024-11-21.
  - It affects cookies without an expiry. @supabase/ssr sets long-lived cookies, so we're probably unaffected (**UNVERIFIED**).

**Email / Messages links open the browser, not the app.**
- WWDC23 (June 2023): "Since links from email will open in the default browser, this will not automatically sign users in to the web app that they already have."
- There is no iOS link capture for Home Screen web apps. macOS got it ("Added support for opening links directly in web apps on macOS", Safari 18.0 notes, 2024-09-16). I checked the Web Apps sections of the Safari 18.x, 26.x and 27 release notes: no iOS equivalent through iOS 27.
- Universal Links (`apple-app-site-association`) apply to native apps only (third-party summary; Apple ships no web-app variant). **UNVERIFIED** as an explicit Apple statement.
- "Default browser" may be Chrome. The Gmail app may use its own in-app browser.

Mapped to Vibe's email flows:
- **Signup confirm link:** `src/app/auth/confirm/page.tsx:124`. "verifyOtp({ token_hash }) signs in whichever browser or mail app this is". A tap from Mail signs in Safari or the mail app, not the installed app.
- **8-digit code:** `src/components/auth/ConfirmCodeForm.tsx:39-43` ("for students who … opened it on another device"). This is the in-app path. It should be the primary path when the page is running standalone.
- **Password reset:** `src/app/auth/update-password/page.tsx:262`, `verifyOtp({ token_hash, type: "recovery" })`. It completes in Safari. The student then signs in to the app with the new password (login is password-based, `src/app/auth/login/page.tsx:138`). The copy should say that.

**Leaving and returning (OAuth, Stripe).**
- WWDC23 (June 2023): "In Home Screen web apps on iOS, links outside the scope will open in Safari View Controller."
- firt.dev "What's new on iOS 12.2 for PWAs" (2019-03-26): "When the external URL redirects or points to a URL within the scope … [iOS] closes the browser and loads the content in the standalone window … particularly useful for OAuth."
  - This is from 2019. Whether it still holds on iOS 26/27 is **UNVERIFIED**.
- Vibe's flow:
  - `src/app/plus/PlusActions.tsx:160` does `window.location.assign(url)` to Stripe.
  - Success and cancel URLs are `${site}/plus?checkout=success…` and `${site}/plus?checkout=canceled` (`src/app/api/billing/checkout/route.ts:145-146`).
  - The portal returns to `/plus` (`src/app/api/billing/portal/route.ts:94`).
  - These must be **inside the manifest scope and on the same host the app was installed from** (`https://www.connectvibe.app`). A hop through the apex domain could count as out of scope.
- `window.open` to an outside site (`src/components/LeftNav.tsx:1279`, Google Calendar) should open the in-app Safari sheet. **UNVERIFIED** on 26/27.
- WWDC23's "window.open … always open in the web app regardless of scope" was said about macOS.

---

## (c) Web Push on iOS

### Plain English
- Push works on iPhone since iOS 16.4 (March 2023), but only inside the installed Home Screen app. In a normal Safari tab the feature doesn't exist at all.
- The student has to tap a button of ours, then say yes to Apple's prompt. After that they manage it in **Settings → Notifications → Vibe**, like any app.
- Every push must show something on screen. A hidden "background" push gets Vibe's permission revoked.
- On iOS 18.4 and later we can send plain JSON that the phone displays by itself ("Declarative Web Push"), so there's no silent-push risk. Older phones still need a small service worker.
- The red badge number on the icon is supported and comes with notification permission.
- **No Apple Developer account, no fee, no App Store**: Apple says so explicitly.

### Primary source
Apple Developer, "Sending web push notifications in web apps and browsers". Undated article, fetched 2026-09-24 via its documentation JSON.
https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- "Add web push to Home Screen web apps in iOS 16.4 or later"
- "You don't need to join the Apple Developer Program to send web push notifications." WebKit says the same: https://webkit.org/blog/13878/ (2023-02-16).
- "Provide a method for the user to grant permission with a gesture … call the push subscription method immediately from the gesture's event handler code."
- **"Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site."**
- "If your network infrastructure limits which URLs your server can access, allow access for `https://*.push.apple.com`."

### Rules by version
| Rule | Since | Evidence |
|---|---|---|
| Push API + Notifications + service worker push, Home Screen web apps only | iOS 16.4 | Safari 16.4 notes (2023-03-27); WebKit 13878 (2023-02-16) |
| Badging API `navigator.setAppBadge()` / `clearAppBadge()`; permission "automatically granted when a user gives permission for notifications" | iOS 16.4 | WebKit 13966 (2023-03-27). BCD note: "Passing `0` … will clear the badge". |
| Per-app control in Settings → Notifications; works with Focus; shows on Lock Screen and Apple Watch | iOS 16.4 | WebKit 13878 |
| `Notification` is undefined unless the page runs as a Home Screen app "with a non-default `display` value"; notifications only via `registration.showNotification()` | iOS 16.4 | MDN BCD `api/Notification.json` note (fetched 2026-09-24) |
| Push reliability fix when the app wasn't running | 17.5 | Safari 17.5 notes (2024-05-13): "Fixed several issues that caused Web Push to not show notifications when the web app or Safari was not already running." |
| `pushManager.subscribe` returning an empty endpoint, fixed | 18.2 | Safari 18.2 notes (2024-12-11) |
| **Declarative Web Push** | **iOS/iPadOS 18.4** (macOS in 18.5) | Safari 18.4 notes (2025-03-31): "Added support for Declarative Web Push. (141082392)"; https://webkit.org/blog/16535/meet-declarative-web-push/ (2025-03-27) |
| Nothing new for push in iOS 26.x or 27 | — | Safari 26.0–26.5 and 27 release notes (grepped 2026-09-24); https://webkit.org/blog/18325/webkit-features-for-safari-27-0/ (2026-09-17) and https://webkit.org/blog/17967/ (WWDC26, 2026-06-08) mention no web-app, push or badging change |

**Not supported on iOS** (MDN BCD, fetched 2026-09-24): notification `actions`, `image`, `badge` option (WebKit 280160 NEW), `requireInteraction`, and the `pushsubscriptionchange` event.
- BCD also lists `notificationclick` as unsupported on iOS. Plenty of field code uses it, so this may be a BCD gap: **UNVERIFIED**.
- Either way, the declarative `navigate` URL makes tap-to-open work without relying on `notificationclick`.

### The silent-push rule, in practice
- WebKit, https://webkit.org/blog/12945/meet-web-push/ (2022-06-07): "Violations of the `userVisibleOnly` promise will result in a push subscription being revoked."
- Commonly cited count: **3 pushes without a notification** cancels the subscription (dev.to/progressier "How to fix iOS push subscriptions being terminated after 3 notifications", 2023-06-30). The exact count on iOS 26/27 is **UNVERIFIED**.
- The usual cause is a `push` handler without `event.waitUntil(self.registration.showNotification(...))`.
- Declarative pushes avoid the penalty: if the service worker doesn't show a replacement, "the fallback content displays automatically" (WebKit 16535).

### Declarative Web Push: format and fallback
WebKit 16535 (2025-03-27):
```json
{ "web_push": 8030,
  "notification": { "title": "…", "body": "…", "navigate": "https://www.connectvibe.app/…",
                    "lang": "en-US", "dir": "ltr", "tag": "…", "silent": false,
                    "app_badge": "3", "mutable": false } }
```
- The W3C Push API Working Draft of **2025-12-01** (https://www.w3.org/TR/push-api/) now defines declarative push messages. It requires `web_push: 8030`, `notification.title` and `notification.navigate`. `pushManager` is defined on `Window` as well as `ServiceWorkerRegistration`.
- **No service worker needed.** Subscribe with `window.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` (WebKit 16535; BCD `Window.pushManager` iOS 18.4).
- **If a root-scope service worker exists**, it "shares the same push subscription as the window object" (WebKit 16535).
  - Its `push` event fires with the proposed notification. If it shows a replacement, that's what the student sees; otherwise the declarative one is shown.
- **Older iOS (16.4–18.3) and non-Apple browsers** get the same JSON as an ordinary push. The service worker must parse it and call `showNotification(title, {body, data:{navigate}})`, and handle the tap itself.
- `Content-Type: application/notification+json`:
  - Named in the WebKit explainer (github.com/WebKit/explainers/blob/main/DeclarativeWebPush/README.md) and in third-party guides (pushpad.xyz/blog/declarative-web-push, 2025-03-18; aimtell.com/blog/state-of-declarative-web-push-2026, April 2026).
  - The WebKit blog and the W3C draft don't state it as a requirement. Whether Apple needs it is **UNVERIFIED**, and it's harmless to send.
- The explainer uses older field names (`default_action_url`, a `pushnotification` event). **Follow the WebKit blog and the W3C draft** (`navigate`, `push` event).

### Endpoints, VAPID and server rules (Apple doc above, error table)
- Endpoints are on Apple's push service: allow `https://*.push.apple.com`.
  - In practice they look like `https://web.push.apple.com/<token>` (seen in github.com/web-push-libs/web-push-php/issues/406). The exact shape is **UNVERIFIED** against an Apple doc, so treat the endpoint as opaque.
- **VAPID is required.** The public key "must match the public key you provided to `PushManager.subscribe`" (`VapidPkHashMismatch`).
  - "Don't refresh your JWT more frequently than once per hour."
- `BadJwtToken` if:
  - the `sub` claim "isn't a URL or `mailto:`";
  - `aud` isn't the push service origin;
  - "expiration … is more than one day into the future".
  - Placeholder subjects like `mailto:x@localhost` get rejected (third-party reports on GitHub, 2025–2026).
- Headers:
  - `TTL` is required (`BadTtl`); Apple may store a message "for 30 days or fewer".
  - `Urgency` must be `very-low|low|normal|high`.
  - `Topic` is at most 32 base64url characters; it collapses notifications.
- Payload limit **4 KB** (`PayloadTooLarge`, 413).
- **410 = "The device token has expired"**: delete that subscription.
- 429 = too many requests to one device.
- Send over HTTP/1.1 or HTTP/2 with SNI; at most 100 unacknowledged requests per HTTP/1.1 connection.
- The standard `web-push` npm library handles all of this. Run the sender on the Node runtime, not the Edge runtime (it needs Node crypto). **UNVERIFIED** for our exact Vercel setup.

### Subscription churn
- iOS has no `pushsubscriptionchange` (BCD), so the server only learns of a dead subscription from a **410/404** on send.
- Forum reports describe subscriptions going dead after 1–2 weeks, or after reinstalling the app. Examples: developer.apple.com/forums/thread/786360; xenforo.com/community/threads/lost-push-subscriptions-for-ios-pwa.215833/. **UNVERIFIED** in cause and frequency.
- Deleting the Home Screen icon removes the app and, logically, its subscription (**UNVERIFIED**).
- Defense: on every app open (when permission is `granted`), call `pushManager.getSubscription()` and upsert it server-side. Treat each install as its own device row.

---

## (d) EU / Digital Markets Act

### Plain English
- In February 2024 Apple briefly made Home Screen web apps in the EU open as plain Safari bookmarks.
- After an outcry it reversed that on March 1, 2024, before iOS 17.4 shipped. EU users have had normal Home Screen apps ever since.
- Nothing since then takes anything away. For IU and Purdue students it doesn't matter.

### Detail
- **Feb 2024 (iOS 17.4 betas, EU only):** Home Screen web apps opened in Safari.
  - WebKit bug 268643, "[iOS 17.4 Beta in EU] REGRESSION: PWA added to Home Screen are forced to open in Safari". Created 2024-02-02, RESOLVED FIXED, last changed 2025-08-14.
  - Apple's reason: the DMA would make it allow web apps on non-WebKit engines.
- **2024-03-01 reversal:** Apple's developer-site update, as quoted by TechCrunch: "we will continue to offer the existing Home Screen web apps capability in the EU". Also: they "continue to be built directly on WebKit and its security architecture".
  - https://techcrunch.com/2024/03/01/apple-reverses-decision-about-blocking-web-apps-on-iphones-in-the-eu/ (2024-03-01)
  - https://9to5mac.com/2024/03/01/apple-home-screen-web-apps-ios-17-eu/ (2024-03-01)
- **iOS 18.2 (Dec 2024):** EU browsers using their own engine may create Home Screen web apps on that engine (`SFAddToHomeScreenInfo`).
  - https://www.macrumors.com/2024/10/24/ios-18-2-eu-third-party-browser-web-apps/ (2024-10-24)
  - Open Web Advocacy says no vendor has shipped a non-WebKit engine on iOS in practice: open-web-advocacy.org/blog/apples-browser-engine-ban-persists-even-under-the-dma/. **UNVERIFIED** as of today.
- **Now:** Apple's DMA developer page (https://developer.apple.com/support/dma-and-apps-in-the-eu/, fetched 2026-09-24) discusses terms effective October 1, 2026. It has **no** Home Screen web app text, and nothing in Safari 26/27 notes touches the EU.

---

## (e) Standalone quirks that bite real apps

### Plain English
The installed app has no address bar, no reload button, no back button and no pull-to-refresh. We have to build those in. Several layout tricks that work in Safari behave differently fullscreen, especially the keyboard and screen height.
Storage is **not** at risk of being wiped after 7 days: that rule counts days the app is actually used.

| Quirk | What happens | Evidence | Vibe impact |
|---|---|---|---|
| `100vh` | Equals the *large* viewport, so full-height layouts overflow or leave gaps. `dvh`/`svh`/`lvh` supported since 15.4. | MDN BCD `css/types/length` (2026-09-24); WebKit 301108 (above) | 34 `100vh` hits vs 23 `dvh/svh/fill-available` hits in `src` + `public/html` (grep 2026-09-24) |
| Safe areas | `env(safe-area-inset-*)` needs `viewport-fit=cover`. `black-translucent` + `cover` is broken on 26/27 (see (a)). | WebKit 301108; frankely29 PR 1142; MrClit issue 411 (Sept 2026) | `viewportFit: "cover"` already set, `src/app/layout.tsx:30`; ~60 `safe-area-inset` uses to re-test |
| Keyboard | No VirtualKeyboard API (WebKit 230225, NEW, touched 2026-09-02). Third-party report of a standalone-only bug: the viewport stays shrunk after the keyboard closes until force-quit, iOS 17/18. **UNVERIFIED** on 26/27. | dev.to/cederhook "Fixing the iOS standalone-PWA keyboard bug…" (2026-07-27) | Messages composer and post composer: test with the keyboard up, then dismissed |
| No pull-to-refresh / reload | The standalone window has no reload control. | github.com/fmaclen/canutin/issues/449; firt.dev/pwa-design-tips. **UNVERIFIED** on 27, but no Apple note adds one. | Needs an in-app refresh (feeds) and a reload when a new deploy lands |
| No back button | The edge-swipe back gesture exists (since iOS 12.2; firt.dev/ios-12.2, 2019-03-26), but nothing shows it. | firt 2019 | Only 5 `history.back()`/`router.back()` call sites; every non-root screen needs a visible back |
| External links | Out of scope, they open the in-app Safari sheet (WWDC23). A link back into scope returns to the app (firt 2019, **UNVERIFIED** today). | WWDC23 10120 | Stripe, Google Calendar, links in posts and bios |
| File upload / camera | `<input type=file>` shows the Photo Library / Take Photo / Choose File sheet. Safari 18.4 added `webkitdirectory` on iOS. Safari 17.2 (web-apps section, Mac-focused) fixed an issue that "repeatedly asks for camera access after relaunching a web app". Standalone behavior on 26/27 is **UNVERIFIED**; test. | Safari 18.4 blog (2025-03-31); Safari 17.2 notes | 6 file inputs (`src/components/mobile/ProfileMobile.tsx:1466`, `:1660`, `src/components/mobile/MessagesMobile.tsx:1933`, `src/app/campus/campus-home.tsx:6008`, `src/app/orgs/[handle]/admin-actions.tsx:477`, `:662`) |
| Media | Sound is on by default on iOS web apps (WWDC23). Muted inline autoplay needs `playsinline`. Safari 26.2 fixed "an audio element failed to play when re-opening a Home Screen Web App" (2025-12-12 notes). | WWDC23; Safari 26.2 notes | `playsInline` already used (`src/components/mobile/PostViewerMobile.tsx:838`, `public/html/_postViewer.js:1078`) |
| Downloads | `.ics` / file downloads inside standalone. **UNVERIFIED**; test. | none found | Calendar export in `src/components/LeftNav.tsx` |
| Wake Lock | Works in Home Screen apps since 18.4. | Safari 18.4 notes | none now |

### Storage and eviction
- **Quota:** a Home Screen web app "has the same origin quota and overall quota as when it is opened in a browser app": up to 60% of disk per origin and 80% overall for browser apps (https://webkit.org/blog/14403/updates-to-storage-policy/, 2023-08-10).
  - Eviction is least-recently-used.
  - `navigator.storage.persist()` is granted "based on heuristics like whether the website is opened as a Home Screen Web App" (same post).
- **7-day cap:** "Web applications added to the home screen are not part of Safari and thus have their own counter of days of use. Their days of use will match actual use of the web application which resets the timer." (https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/, 2020-03-24).
  - The cap counts days the app is *used* without the site being interacted with, so a student who ignores the app for a month loses nothing.
  - No later WebKit post changes this; that still holds is **UNVERIFIED**, but I found nothing contrary.
- **Cookies:** `document.cookie` cookies are capped at 7 days (ITP 2.1, 2019-02-21). Server-set cookies aren't. Keep the session on the server-set path (`src/proxy.ts:219`).

---

## iOS checklist for Vibe

Concrete items for the wave plan. "Test" means on a real iPhone on **iOS 27.0 and a 26.x device**, as a non-admin at 375px, per our browser-pass rule.

**Manifest and head tags**
1. Add a manifest. Next's `src/app/manifest.ts` serves `/manifest.webmanifest`, and `webmanifest` is already an asset extension in the proxy (`src/proxy.ts:95`, comment at `src/proxy.ts:86`), so it won't be redirected.
   - Fields: `id: "/"`, `start_url: "/"` (or the signed-in home), `scope: "/"`, `display: "standalone"`, `name: "Vibe"`, `short_name: "Vibe"`.
   - Icons: 192, 512, and a 512 or 1024 `purpose: "maskable"`, all opaque.
   - `theme_color` / `background_color`: `#FAF7F2`. iOS ignores `background_color`, but Android uses it.
2. Keep `apple-icon.png`. It's 180×180 with opaque (white) corners (`src/app/apple-icon.png`; `src/app/layout.tsx:23`). On iOS it **overrides** manifest icons, so make it the final brand icon, and never strip it by user agent.
3. Add `appleWebApp` metadata: title "Vibe", `statusBarStyle: "default"`. **Do not use `black-translucent`** (iOS 26/27 bugs).
   - Set `html, body { background: #FAF7F2 }` so the launch flash and the status-bar area match.
   - The existing `themeColor: "#FAF7F2"` (`src/app/layout.tsx:31`) is harmless.
4. Decide on splash screens: either `apple-touch-startup-image` links per iPhone size, or accept a plain background flash. Launch settings may be cached at install, so decide **before** students install.
5. Serve everything from one host. Install from, start at, and return from Stripe to `https://www.connectvibe.app`. The apex domain should redirect **before** a student ever installs.

**Install coaching**
6. Detect standalone with `navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches`. `display-mode` alone is unreliable (WebKit 264218).
7. For iOS Safari that isn't installed, show a coaching sheet with Apple's current steps: **… → Share → Add to Home Screen → keep "Open as Web App" on → Add**.
   - Include the "Tabs layout Bottom/Top: tap Share directly" variant and the "Edit Actions" fallback.
   - There's no programmatic prompt, so don't build one.
8. For in-app browsers (Instagram, TikTok, Snapchat), show "Open in Safari first". Chrome on iOS can also add to the Home Screen (16.4+). **UNVERIFIED**: confirm Instagram's web view has no Add to Home Screen.
9. Put the coaching behind a dismiss that's remembered in localStorage. It won't carry into the installed app, which is fine because the app never shows it.

**Sign-in inside the app**
10. The first launch should usually already be signed in (cookie copy, iOS 17.2+). Test: sign in in Safari → install → open → signed in.
    - Then test that sign-out in the app leaves Safari signed in, and the other way round. That's expected; don't "fix" it.
11. In standalone mode, lead with the **8-digit code** (`src/components/auth/ConfirmCodeForm.tsx:39`) for signup confirmation. Say plainly that email links open Safari.
12. Password reset finishes in Safari (`src/app/auth/update-password/page.tsx:262`). Add copy that says "then open Vibe from your Home Screen and sign in with your new password".

**Push notifications**
13. Put a "Turn on notifications" button that shows **only in the installed app** (in Safari tabs `PushManager` doesn't exist).
    - Call `Notification.requestPermission()` / `pushManager.subscribe()` directly in the tap handler, with no `await` before it.
    - Never prompt on page load.
14. Subscribe with `userVisibleOnly: true` and our VAPID public key. Prefer `window.pushManager` when present (iOS 18.4+), else `registration.pushManager`. Both share one subscription when the service worker is at root scope.
15. Store subscriptions server-side: one row per device, owned by the user, readable only by the service role (our security model).
    - Upsert on **every** app open.
    - Delete on a 404 or 410 response.
    - iOS never fires `pushsubscriptionchange`.
16. Send every push as a **declarative payload**: `{"web_push":8030,"notification":{"title","body","navigate","tag","app_badge"}}`.
    - Also send `Content-Type: application/notification+json` (harmless, **UNVERIFIED** as required).
    - Headers: `TTL`, `Urgency`, and a `Topic` of 32 characters or fewer for collapse.
    - Keep payloads under **4 KB**.
17. Service worker `push` handler (for iOS 16.4–18.3, Android and desktop):
    - Parse the same JSON and **always** `event.waitUntil(self.registration.showNotification(...))`.
    - Handle `notificationclick` by opening `data.navigate`.
    - **Never send a data-only or "silent" push.** iOS revokes permission.
18. VAPID `sub` must be a real `mailto:` or `https:` URL (not localhost or `.invalid`). JWT `exp` must be under 24h, and don't re-sign more than hourly.
    - Send from the Node runtime.
    - Allow outbound `*.push.apple.com`.
    - No Apple Developer account is needed.
19. Badge: `navigator.setAppBadge(unreadCount)` on app open and on read. `setAppBadge(0)` / `clearAppBadge()` clears it. Also send `app_badge` in pushes. It only works after notification permission.
20. Don't rely on notification `actions`, `image`, `badge` icon or `requireInteraction`; iOS ignores them.

**Standalone polish**
21. Visible back control on every non-root screen, since there's no browser chrome. Today there are only 5 `back()` call sites.
22. An in-app refresh for feeds (pull-to-refresh or a button), and a "new version, tap to reload" path when the service worker updates.
23. Replace `100vh` with `100dvh`/`100svh` in full-height shells (34 remaining hits). Test the keyboard open → close cycle in Messages and the composer.
24. Re-test all ~60 `safe-area-inset` uses with `statusBarStyle: "default"`: the top inset changes when the status bar becomes opaque.
25. Stripe from standalone:
    - Tap Upgrade → Checkout opens in the in-app Safari sheet → pay with the test card → lands back **in the app** on `/plus?checkout=success`.
    - Repeat for cancel and for the billing portal (`src/app/api/billing/portal/route.ts:94`).
26. Test the six file inputs (photo library and camera), inline video playback, and the `.ics` calendar export inside the installed app.
27. Keep drafts server-side or accept that they're per-install. Storage isn't wiped by the 7-day rule while the app is in use, but a student who deletes the icon loses everything local.

---

## Sources (primary first; all fetched 2026-09-24)
- Apple Support, Turn a website into an app in Safari on iPhone (iOS 27/26 guide): https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- Apple Developer, Sending web push notifications in web apps and browsers: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Safari release notes 16.4, 17.0, 17.2, 17.5, 18.0, 18.2, 18.4, 18.5, 26.0–26.5, 27.0: https://developer.apple.com/documentation/safari-release-notes/ (27.0 released 2026-09-14)
- WebKit: 17333 (2025-09-15), 16993 (2025-06-09), 18325 (2026-09-17), 17967 (2026-06-08), 16535 (2025-03-27), 16574 (2025-03-31), 13878 (2023-02-16), 13966 (2023-03-27), 12945 (2022-06-07), 12445 (2022-03-14), 14205 (2023-06-06), 14403 (2023-08-10), 10218 (2020-03-24), 8613 (2019-02-21)
- WWDC23 "What's new in web apps": https://developer.apple.com/videos/play/wwdc2023/10120/
- W3C Push API, Working Draft 2025-12-01: https://www.w3.org/TR/push-api/
- MDN browser-compat-data (main, 2026-09-24): manifests/webapp/*, api/{Window,Navigator,PushManager,Notification,ServiceWorkerGlobalScope,ServiceWorkerRegistration}, css/at-rules/media
- WebKit bugs (REST, 2026-09-24): 301108, 264218, 272325, 268643, 280160, 194593, 230225
- Secondary: firt.dev/ios-12.2 (2019-03-26); firt.dev/notes/pwa-ios (2023-06-06); dev.to/progressier (2023-06-30); dev.to/cederhook (2026-07-27); TechCrunch and 9to5Mac (2024-03-01); MacRumors (2024-10-24); GitHub frankely29 PR 1142 (2026-09-14) and MrClit issue 411 (2026-09-17); pushpad (2025-03-18); aimtell (April 2026)
