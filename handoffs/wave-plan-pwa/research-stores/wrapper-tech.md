# Store apps: which wrapper, and how (research, 2026-09-24)

Reader: Franky, then the store-apps plan. Read-only research. Repo claims are `path:line`; web claims carry a
URL and a date. **UNVERIFIED** means I could not confirm it from a primary source or it needs a real phone.

---

## 0. The short version (plain English)

- **Use Capacitor 8 on both stores, loading the live site.** Capacitor is a free, open-source native shell
  (current release 8.5.2, published 2026-09-24 on npm). The app opens `https://www.connectvibe.app/campus`
  inside the phone's own web view. Everything students see still comes from Vercel.
- **Every web deploy updates the app on the spot.** Only native changes (push setup, icons, permissions, link
  settings) need a new store build. That is the main reason to choose it.
- **Vibe can't be packed inside the app.** Its pages are built on the server for each request (147 API routes,
  the proxy, cookies). Only an offline page, the icon and the splash screen ship inside the app.
- **What makes it more than a website in a frame** (Apple's rule 4.2): native push, email and share links
  that open the app, the system share sheet, haptics, an offline screen, swipe-back, and optionally a native
  tab bar. Those are also the features students notice.
- **Push has to be native in the store apps.** The iPhone app can't use web push. Android's web view can't
  either. That changes the PWA plan: wave 2's outbox should deliver to phones via Firebase Cloud Messaging
  first, with web push for desktop added after.
- **Email links will mostly open the app.** Universal Links (iPhone) and App Links (Android) open the app
  from Apple Mail and most mail apps. That fixes the Safari problem in most cases. Outlook Safe Links and
  other link-wrapping can still send students to the browser, so the 8-digit code stays the backup.
- **Four things break inside a web view today** and need small fixes: the `.ics` calendar download (both
  phones), the résumé "Open file" button, same-site "open in new tab" links (iPhone sends them to Safari,
  which isn't signed in), and Stripe Checkout (it opens in the browser, and Apple has payment rules).
- **A conflict with wave 1:** the new platform detector would label the iPhone app "iOS Safari, not
  installed" and show the Add-to-Home-Screen coach **inside the store app**. It needs an "in the app" branch
  that is checked first.
- **This Mac:** Xcode 26.4.1 is fine and CocoaPods is not needed (Capacitor 8 uses Swift Package Manager).
  Android Studio and the Android SDK still need installing. No CI is needed for launch.
- **Time:** about 7 engineering days to a first TestFlight build and a Play internal test, once the developer
  accounts exist. The accounts are the critical path: an organization account needs a D-U-N-S number, which
  can take up to 7 business days before Apple can use it.
- **Longer term (fuller native apps):** build the native app later with Expo/React Native. Ship it as an
  **update** to the same store listings, with the same bundle ID and package name. Pick those IDs once, now.

---

## 1. What can be bundled vs what must stay remote

### Plain English
Some apps ship all their pages inside the app. Vibe can't. Next.js only builds a fully static copy when the
site never needs the server, and Vibe needs it for almost every screen.

### Detail
- Next.js's static export (`output: 'export'`) does not support cookies, route handlers that read the request,
  the proxy, server actions, dynamic routes without `generateStaticParams`, redirects/headers/rewrites or
  default image optimization. Source: https://nextjs.org/docs/app/guides/static-exports (docs v16.3.6,
  lastUpdated 2026-08-25).
- Vibe uses all of these: 147 `route.ts` files under `src/app/api`; `src/proxy.ts` (318 lines, session refresh
  plus suspension gates at `:235–243`); per-request auth pages; dynamic `/profile/[handle]`, `/orgs/[handle]`,
  `/posts/[id]`.
- **What can ship in the app:** the offline/error page (Capacitor `server.errorPath`), icons, the splash
  screen, and native code. A "bundled shell" that shows a local page and then jumps to the site (option 1b
  below) gives no real benefit over `errorPath`.

---

## 2. The options compared

### Plain English
Five ways to get into the stores. Capacitor is the fastest safe route for both stores. A Trusted Web
Activity (TWA) is a good one-day backup for Android only. Expo is the right tool for the later, fuller native
app, but it is too much work before October 31.

| | Apple risk | Offline | Updates | Push | Effort to first test | Cost |
|---|---|---|---|---|---|---|
| **1a Capacitor, `server.url` = live site** (recommended) | Medium: guideline 4.2; lowered by native features | Local error page (`errorPath`); no service worker on iPhone (§4.4) | Web deploy updates the app at once | Native (FCM/APNs) via plugin; the bridge works on the remote page | ~7 days | $0 |
| 1b Capacitor, local shell + `allowNavigation` | Same as 1a | Bundled first screen | Same | Same | ~8 days | $0 |
| 2 PWABuilder | Android = Bubblewrap TWA (fine). iOS package: **community-only, repo archived** | SW (Android) | Web deploy | Android: web push via TWA. iOS: push code commented out | 1 day Android; iOS not advised | $0 |
| 3 Commercial (Median.co etc.) | Medium; vendor adds native nav/tabs | Vendor offline page | Web deploy | OneSignal/FCM add-on | 3–5 days + vendor queue | License, see below |
| 4 Expo + WebView + native tabs | Low–medium: real native tab bar | Manual | Web deploy + EAS Update | `expo-notifications` | ~12–15 days | $0–19/mo EAS |
| 5 TWA, Android only | n/a | The PWA's own SW | Web deploy | **Web push works** through notification delegation | ~1 day | $0 |

**1. Capacitor.** Current major is 8 (announced 2025-12-08, https://ionic.io/blog/announcing-capacitor-8).
Capacitor 8 needs Node 22+, Xcode 26+, iOS 15.0 deployment target, Android minSdk 24 and compile/target SDK 36,
AGP 8.13.0, Gradle 8.14.3, Android Studio Otter 2025.2.1+ (https://capacitorjs.com/docs/updating/8-0). SPM is
the default for new iOS projects; CocoaPods is optional.
- **The docs' warning, quoted:** `server.url` is "intended for use with live-reload servers. This is not
  intended for use in production." `allowNavigation` carries the same line
  (https://capacitorjs.com/docs/config, v8 docs, fetched 2026-09-24). It is a support warning, not a store
  rule: Apple can't see the config. People report approved apps built this way; a maintainer warns "it can
  lead to app rejections, so use at your own risk" (https://github.com/ionic-team/capacitor/discussions/4080,
  comments 2021-01-18 and 2021-06-15). **Plugins work on the remote page:** the bridge is injected, and
  `Capacitor.getPlatform()` returns the native platform (same thread).
- **Start path:** `server.appStartPath` (since 7.3.0) appends a path to the app URL
  (Capacitor `cli/src/declarations.ts`, main branch). Use `server.url: "https://www.connectvibe.app"` with
  `appStartPath: "/campus"`. **Don't** put `/campus` in `server.url`: iOS treats any URL that doesn't
  start with `server.url` as outside the app and opens it in Safari (`WebViewDelegationHandler.swift`
  `isApplicationNavigation`, fetched from main 2026-09-24). UNVERIFIED on a device that `appStartPath`
  applies with a remote `server.url`.
- **Offline:** `server.errorPath` shows a local HTML page when loading fails ("On Android the html file won't
  have access to Capacitor plugins", config docs). There's no service-worker cache on iPhone (§4.4).

**2. PWABuilder.** Its Android package is Bubblewrap, which is maintained (`@bubblewrap/cli` v1.25.0, released
2026-07-31, GitHub API). Its iOS package is a WKWebView template. The `pwa-builder/pwabuilder-ios` repo is
**archived** (last push 2025-06-10). Its README says iOS is now supported "in a community driven fashion", with
no PWABuilder devs maintaining it. Push in that template is commented out
(https://github.com/pwa-builder/pwabuilder-ios/issues/6). **Not for iOS.**

**3. Commercial wrappers.** Median.co (formerly GoNative) sells a no-code WebView shell with a native tab bar
and side menu, a JavaScript bridge, OneSignal/Firebase push, deep links and an optional publishing service.
Each license covers one app on iOS and Android (https://docs.median.co/docs/licenses, dated 2026-09-10). Prices:
the pricing page blocked automated fetches. Third-party pages report a $790 "Professional" license, or
$99–$299/month. **UNVERIFIED.** MobiLoud, Natively and WebToApp sell similar products (prices UNVERIFIED).
For a team that writes code, none of these is faster than Capacitor. They add a vendor between Vibe and the
stores, and the push and link plumbing still has to be wired into Vibe's server. **Not recommended.**

**4. Expo / React Native shell.** Expo SDK 57 (React Native 0.86, changelog published 2026-06-30,
https://expo.dev/changelog/sdk-57; `expo` 57.0.25 on npm). Native tabs use `UITabBarController` with Liquid
Glass on iOS 26 and Material bottom navigation on Android. They're stable from SDK 58
(`expo-router/native-tabs`) and `unstable-native-tabs` in 55–57
(https://docs.expo.dev/router/advanced/native-tabs/). `react-native-webview` 14.0.1 has what a shell needs:
`sharedCookiesEnabled`, `allowsBackForwardNavigationGestures`, `onOpenWindow`, `setSupportMultipleWindows`,
`onFileDownload` (iOS only), `applicationNameForUserAgent`, `injectedJavaScriptBeforeContentLoaded`
(https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md).
- **Why not now:** each thing Capacitor does out of the box has to be wired by hand. That includes the
  JS↔native bridge (`postMessage`), file-picker edge cases, downloads, new-window handling and back
  handling. A native tab bar also means one WebView per tab, which brings memory cost, keeping auth and state
  in sync across tabs, and a double tab bar unless the web one hides. Estimate ~12–15 days. That isn't safe
  next to moderation, legal and the PWA work before Oct 31.
- **Why later:** this is the natural road to "fuller native". Screens can move from WebView to React Native
  one tab at a time, in the language the web app already uses. EAS pricing: Free = 15 Android + 15 iOS builds
  a month, low-priority queue ("90+ minute wait times" at peak); Starter $19/month; pay-as-you-go $1–$4 per
  build (https://expo.dev/pricing, fetched 2026-09-24).

**5. Trusted Web Activity (Android only).** The app opens the site in the student's own Chrome, full-screen.
It shares Chrome's cookies and service worker, so the Android side of the PWA wave (install, offline, **web
push**) carries over. Web pushes show under the app's name and icon through notification delegation
(Bubblewrap `enableNotifications`). Android 13's permission prompt was fixed in Bubblewrap PR #731
(https://github.com/GoogleChromeLabs/bubblewrap/issues/730, closed).
- **Needs:** `/.well-known/assetlinks.json` with the SHA-256 of the **Play app-signing key**. If verification
  fails, the app shows as a Custom Tab with a browser bar. The TWA uses the default browser if it supports
  TWAs, else any browser that does, else a Custom Tab
  (https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2,
  updated 2026-02-26). Chrome 72+.
- **Play policy:** Play forbids apps that "provide a webview of a website without permission from the website
  owner or administrator". Vibe owns its site, so this is allowed
  (https://support.google.com/googleplay/android-developer/answer/9899034, fetched 2026-09-24).
- **Limits:** no JS bridge to native plugins, no native tab bar, and behaviour depends on the student's
  browser. **Use it as the one-day fallback** if Capacitor Android slips, not as the plan. Running two wrapper
  technologies means two "in the app" modes in the web code.

---

## 3. What the stores will judge

### Plain English
Apple is the strict one. It rejects apps that feel like "a repackaged website". Vibe already meets Apple's
social-app rules (report, block, filter, contact, delete account). The native features in §4 are what carry
it over the "more than a website" bar. The reviewer also needs a working demo account.

### Detail (App Review Guidelines, https://developer.apple.com/app-store/review/guidelines/, fetched 2026-09-24; no date shown)
- **4.2:** "Your app should include features, content, and UI that elevate it beyond a repackaged website. If
  your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store."
  **4.2.2:** apps shouldn't primarily be "web clippings, content aggregators, or a collection of links."
  Mitigation that reviewers can see: native push, Universal Links, share sheet, haptics, the offline screen,
  swipe-back, a native tab bar if the spike works (§4.6), and App Review notes that list them.
- **2.5.2** bars downloading code that "introduces or changes features or functionality". **4.7** allows
  "HTML5 and JavaScript mini apps". A remote-URL shell sits in a grey zone that Apple enforces through 4.2,
  not 2.5.2. Keep the native layer honest and don't hide features from review.
- **1.2 UGC:** requires a filter, reporting with timely responses, blocking, and published contact info.
  Vibe shipped all four in session 64 (report, block, word filter, help@connectvibe.app, a 24-hour review
  commitment).
- **5.1.1(v):** account deletion inside the app. It exists: `src/components/settings/SettingsClient.tsx:1328`
  ("Delete account…").
- **4.8** applies only to third-party logins. Vibe is email + password only, so Sign in with Apple is not
  required.
- **Demo account:** posting needs a verified .edu email. App Review needs a signed-in, school-verified test
  account with seeded content. Plan it now: a founder-controlled account, never a real student.
- **Upload rules:** since 2026-04-28 uploads must be built with Xcode 26+ and the iOS 26 SDK
  (https://developer.apple.com/news/upcoming-requirements/). Xcode 26.4.1 on this Mac qualifies.
- **Play:** from 2026-08-31, new apps and updates must target Android 16 / API 36 (extension possible to
  2026-11-01) (https://support.google.com/googleplay/android-developer/answer/11926878). Capacitor 8 targets 36.
- **Payments (flag only; the payments research owns this):** 3.1.1 requires in-app purchase for digital
  features. 3.1.1(a) as fetched says link-out entitlements "are not required for developers to include
  buttons, external links, or other calls to action in their United States storefront apps." That rule rests
  on the Epic v. Apple injunction. The Ninth Circuit largely upheld it on 2025-12-11
  (https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html). The Supreme
  Court then took the case (No. 25-1311; Apple's merits brief was filed 2026-09-14, supremecourt.gov docket),
  so the rule may change after launch. Google Play US: external links and alternative billing have been
  allowed since 2025-12-09, with service fees reported from 2026-10-01
  (https://support.google.com/googleplay/android-developer/answer/15582165, updated 2026-09-17).

---

## 4. The recommended stack, piece by piece

### 4.1 Shell configuration
**Plain English:** the app is one screen: a full-screen web view pointed at the live site. It carries a name
tag in its browser signature, so the website knows it is inside the app.

- `mobile/capacitor.config.ts`:
  - `appId: "app.connectvibe.vibe"` (example; decision D1)
  - `appName: "Vibe"`
  - `webDir: "www"`
  - `server: { url: "https://www.connectvibe.app", appStartPath: "/campus", errorPath: "offline.html" }`
  - `ios.appendUserAgent: " VibeApp/1 (ios)"` and `android.appendUserAgent: "VibeApp/1 (android)"`
- Leading space on iOS: Capacitor 8 stopped adding whitespace to `ios.appendUserAgent`
  (https://capacitorjs.com/docs/updating/8-0).
- No `allowNavigation` entries. Any host other than `www.connectvibe.app` opens outside the app (§4.5).
- Plugins, with current npm versions (checked 2026-09-24):
  - `@capacitor/app` 8.1.1: links, back button, resume
  - `@capacitor/status-bar` 8.0.3
  - `@capacitor/splash-screen` 8.0.2
  - `@capacitor/browser` 8.0.4: SFSafariViewController / Custom Tabs
  - `@capacitor/share` 8.0.2
  - `@capacitor/haptics` 8.0.2
  - `@capacitor/keyboard` 8.0.5
  - `@capacitor-firebase/messaging` 8.5.2
  - `@capacitor/filesystem`, for `.ics` (§4.5)
  - `@capacitor/assets` 3.0.5, which generates icons and the splash from `src/app/icon.svg`
- Local development: a dev-only config with `server.url: "http://<Mac LAN IP>:3000"` and `cleartext: true`,
  against `next dev` on the **local** Supabase. Never point a dev build at production while writing data
  (critic.md C9: `next start` reads the live DB).

### 4.2 Native push
**Plain English:** phones get notifications through Apple's and Google's push services, not web push. The
simplest setup sends every phone notification through Google's Firebase. Firebase hands iPhone messages to
Apple. The rules for who gets buzzed and what the lock screen shows (wave 2's dispatcher, and decisions D1/D2
in critic.md) stay exactly the same. Only the delivery step changes.

- **Why native:** Android WebView has no Push API (https://developer.mozilla.org/en-US/docs/Web/API/PushManager
  compat table). An iOS WKWebView app doesn't get Safari's Home Screen web push. It also has no service
  worker unless App-Bound Domains are on (§4.4).
- **Plugin choice:**
  - `@capacitor/push-notifications` 8.1.2 returns the **APNs** token on iOS and the **FCM** token on Android
    ("On iOS it contains the APNS token", https://capacitorjs.com/docs/apis/push-notifications). That means
    two server senders: APNs HTTP/2 with a `.p8` JWT, and FCM HTTP v1.
  - `@capacitor-firebase/messaging` 8.5.2 returns an **FCM token on both** and adds topics. On iOS it needs
    `GoogleService-Info.plist`, the Firebase SDK (SPM works on Capacitor 8) and AppDelegate hooks, and the
    APNs key uploaded to Firebase (https://github.com/capawesome-team/capacitor-firebase/tree/main/packages/messaging).
    Free and open source.
  - **Recommend the Firebase plugin:** one sender (`firebase-admin` or the FCM HTTP v1 REST API from a
    Node-runtime route), one token format, one failure map (`UNREGISTERED` → delete the token).
- **Server:**
  - Store tokens in a service-role-only table, following the house rule "grants, not routes" and critic C14.
  - Easiest shape: generalize wave 2's `push_subscriptions` with a `kind` of `web` or `fcm`, plus `platform`.
  - Registration route: `src/app/api/me/device-token/route.ts` (POST upsert by token, DELETE). The DELETE
    joins `restrictedApiAllowed`, as in C15.
  - `leaveDeviceClean()` (wave 3B) must also delete the FCM token and call `FirebaseMessaging.deleteToken()`.
- **Payload:**
  - FCM `notification` (title/body) plus `data.url`, an absolute `https://www.connectvibe.app/...` URL, same as R13.
  - `apns.payload.aps.badge` for the app-icon count.
  - `android.notification.channel_id`.
  - A tap arrives through the plugin's `notificationActionPerformed`. The web code then navigates the web view
    to `data.url` after checking its origin, same as R14.
- **Permissions:**
  - iOS asks once. Ask in context, as in wave 3E ("Know when they reply"), never on first launch.
  - Android 13+ needs `POST_NOTIFICATIONS`. For apps targeting 33+, notifications are off by default on new
    installs and the app controls when the dialog shows
    (https://developer.android.com/develop/ui/views/notifications/notification-permission).
  - Call `checkPermissions()`/`requestPermissions()`.
  - Create Android channels in code (Android 8+), e.g. `messages` and `activity`.
  - The small icon must be "white pixels on a transparent backdrop" (Capacitor push docs). Wave 1's
    `badge-mono-96.png` art can seed it.
- **Accounts needed:** a Firebase project (free), and an APNs Auth Key (`.p8`) from the paid Apple Developer
  account, uploaded to Firebase.
- **Effect on the PWA wave:**
  - Wave 2's outbox and trigger, the send-time checks and the payload rules all carry over.
  - The sender becomes pluggable: `sendFcm` first (store apps), then `sendWebPush` (desktop, Home Screen).
  - VAPID keys and `web-push` stay useful for desktop, but they are no longer on the launch path.

### 4.3 Email and share links that open the app
**Plain English:** once the website publishes two small files, tapping a Vibe link on a phone that has the app
opens the app instead of the browser. That covers email confirm, school verify, password reset and shared
posts. It's the fix for "email links open Safari". It isn't guaranteed, because some school mail systems
rewrite links. So the app keeps leading with the 8-digit code.

- **Where the links point today:**
  - Confirm: `{{ .SiteURL }}/auth/confirm?token_hash=…` (`supabase/templates/confirmation.html:50`).
  - Reset: `/auth/update-password?token_hash=…` (`src/app/api/auth/password-reset/route.ts:95`).
  - School verify: `/auth/verify-school?token=…` (`src/app/api/auth/school-email/request/route.ts:246`).
  - All three are on our own domain, which is what Universal Links and App Links need. (That production
    `SiteURL` is exactly `https://www.connectvibe.app` is UNVERIFIED; check the Supabase Auth URL settings.)
- **iOS:**
  - Host `https://www.connectvibe.app/.well-known/apple-app-site-association` "using https:// with a valid
    certificate and with no redirects".
  - Since iOS 14 devices fetch it through Apple's CDN, which "requests the apple-app-site-association file
    for your domain within 24 hours. Devices check for updates approximately once per week after app
    installation." Each subdomain needs its own entry
    (https://developer.apple.com/documentation/xcode/supporting-associated-domains, fetched 2026-09-24).
  - Entitlement: `applinks:www.connectvibe.app`. Don't associate the bare `connectvibe.app` domain if it
    redirects.
- **Android:**
  - Host `https://www.connectvibe.app/.well-known/assetlinks.json`: `application/json`, no redirects.
  - Intent filter: `android:autoVerify="true"`, VIEW + BROWSABLE + DEFAULT, `https`.
  - Android 12+ verifies each host. "Android 15+: Changes to assetlinks.json can take up to 7 days to
    propagate." Test with `adb shell pm verify-app-links --re-verify` / `pm get-app-links`
    (https://developer.android.com/training/app-links/verify-android-applinks, updated 2026-09-16).
  - Include **both** SHA-256 fingerprints: the upload key and the Play app-signing key.
- **Paths to claim:**
  - `/auth/confirm*`, `/auth/update-password*`, `/auth/verify-school*`, `/auth/callback*`
  - `/campus*`, `/messages*`, `/posts/*`, `/profile/*`, `/orgs/*`, `/settings*`
- **Paths to exclude:**
  - `/` (so the landing page's "Get the app" button still works in Safari)
  - `/legal/*`, `/api/*`, `/html/*`, `/journal/*`
- **Repo changes:**
  - Serve both files from `public/.well-known/`, with a `next.config.ts` header forcing
    `Content-Type: application/json` on the extensionless AASA.
  - Add `\\.well-known/` to the proxy matcher's negative lookahead (`src/proxy.ts:315–317`, the same fix as
    R11), so no session cookie or redirect ever touches them.
- **In the app:** `App.addListener('appUrlOpen', …)` plus `App.getLaunchUrl()` for cold starts. The web code
  checks the origin, then does `location.assign(pathAndQuery)`. `/auth/confirm` then runs `verifyOtp` inside
  the app's cookie jar (`src/app/auth/confirm/page.tsx:44–60`), which signs the app in.
- **Where it can fail (keep the code path):**
  - Microsoft Safe Links rewrites links in Microsoft 365 mail
    (https://learn.microsoft.com/en-us/defender-office-365/safe-links-about). Whether IU or Purdue turn on URL
    rewriting is UNVERIFIED.
  - Apple (forum, quoting its docs): "If the link tapped by the user is not a universal link but redirects to
    one, the user will be routed through the web browser to the app"
    (https://developer.apple.com/forums/thread/780496). How a given mail app behaves is UNVERIFIED, so test
    Apple Mail, Gmail and Outlook on real phones.
  - Resend click-tracking would wrap links too. No tracking is set in `src/lib/email/` (grep, 2026-09-24).
    Keep it off.
  - Publish both files **at least a week before launch** (Android propagation, Apple's weekly device check).

### 4.4 Sign-in inside the app (Supabase cookies in WKWebView / Android WebView)
**Plain English:** sign-in works the same as on the website, because the login cookie belongs to Vibe's own
domain. The app keeps its own cookie jar, separate from Safari and Chrome, so students sign in once inside the
app. That also means the "Safari and the Home Screen app share one refresh key" risk from the PWA research
does not apply to the store app.

- **How sign-in is stored:** Vibe's session lives in first-party cookies on `www.connectvibe.app`
  (`src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`). `@supabase/ssr` 0.6.1 defaults to `path=/`,
  `SameSite=Lax`, not HttpOnly, `maxAge` 400 days
  (`node_modules/@supabase/ssr/dist/main/utils/constants.js:4–11`). Calls to Supabase's API carry the token
  in a header, so **no third-party cookies are needed**.
- **ITP:** Intelligent Tracking Prevention "is enabled by default in all WKWebView applications" since iOS 14
  (https://webkit.org/blog/10882/app-bound-domains/, 2020-06-26). It blocks third-party cookies, which don't
  matter here. ITP also caps cookies written by JavaScript (`document.cookie`) at 7 days
  (https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/). Vibe's proxy re-sets the session with
  HTTP `Set-Cookie` on navigations, so the cap should not sign students out. **UNVERIFIED on device.** Check
  the cookie expiry in Safari Web Inspector after a week of use.
- **App-Bound Domains:** don't turn them on in v1. They cap in-app navigation at 10 domains and restrict
  script injection. Their only win is service workers in WKWebView, which need `WKAppBoundDomains` plus
  `limitsNavigationsToAppBoundDomains` (https://github.com/ionic-team/capacitor/issues/4122). The upshot: on
  iPhone `navigator.serviceWorker` is undefined in the app, so wave 1's registrar skips itself (plan R8).
  Offline in the app = `errorPath`.
- **Android WebView** supports service workers. Wave 1's worker will register there, because the hostname
  matches, and that's harmless. Web push can't work there, so hide the web-push UI in the app (§4.7).
- **Cookie persistence:** Capacitor adds a cookie observer to the default `WKWebsiteDataStore`
  (`CAPBridgeViewController.swift:121`). Persistent cookies survive restarts. **UNVERIFIED on device**:
  check that a force-quit and relaunch keeps you signed in.

### 4.5 Web features inside the web view
**Plain English:** most things just work, including photo and video pickers, the résumé viewer and email links
in the page. Four need a small fix, listed as Action.

| Feature (where) | iPhone app (Capacitor) | Android app (Capacitor) | Action |
|---|---|---|---|
| Photo/video pickers: 10 `<input type="file">`, no `capture` attr (`PostComposerMobile.tsx:460`, `ProfileMobile.tsx`, `MessagesMobile.tsx:1933`, `StepPhoto.tsx:112`, `campus-home.tsx:6008`, `orgs/[handle]/admin-actions.tsx`) | System picker (library, camera, files) | `BridgeWebChromeClient.onShowFileChooser` opens the picker; the camera path runs only with `capture` (source :276–300) | Add `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription` to Info.plist (UNVERIFIED which ones the picker strictly needs; add all three) |
| Résumé viewer: pages drawn to canvas (`ResumeViewerMobile.tsx:173`) | Works | Works | None |
| Résumé "Open file", `target="_blank"` (`ResumeViewerMobile.tsx:491,536`) | Opens **Safari**, which isn't signed in → 401 | Same-host URL loads the raw PDF in the web view; Android WebView has no PDF viewer | Hide it in the app, as R16 does in standalone, or share the file via `@capacitor/share` |
| `.ics` export: blob + `<a download>` (`src/lib/feedback/request.ts:234–271`, called at `LeftNav.tsx:1291`) | **Broken**: WKWebView ignores blob `download` (WebKit bug 216918) | **Broken**: Capacitor sets no `DownloadListener` | In the app: fetch → `Filesystem.writeFile` (cache) → `Share.share({ files })`. Capacitor issue #5478 has been open since 2022-03-02 (https://github.com/ionic-team/capacitor/issues/5478). Whether the share sheet offers Calendar is UNVERIFIED |
| Same-site `target="_blank"`: 6 files, e.g. legal links at `auth/signup/page.tsx:429`, and `window.open` at `LeftNav.tsx:1279` | **Every** new-window request goes to Safari, same-site too (`createWebViewWith` → `UIApplication.open`, `WebViewDelegationHandler.swift:334–338`) | Same host stays in the web view; others go to the browser (`Bridge.java` `launchIntent` :389–425) | App-only click handler: same-origin → navigate in place; other origins → `Browser.open` (in-app Safari sheet / Custom Tab) |
| `mailto:` (14 links, e.g. `legal/child-safety/page.tsx:91`) | Handed to the OS → Mail | Intent → mail app | None |
| Stripe Checkout: `window.location` to `checkout.stripe.com`, `success_url` = `/plus?checkout=success` (`api/billing/checkout/route.ts:144–170`) | Opens **Safari**. The return lands in Safari, where the student isn't signed in. Apple 3.1.1 applies | Opens Chrome, same return problem | v1 app: no buy button (production selling is off anyway). Decision D3 |
| Uploads to presigned S3/R2 URLs (`api/me/*-upload-url`) | Cross-origin `fetch`; works | Works | None |
| Keyboard in Messages and the composer (`dvh` layout) | `@capacitor/keyboard` resize mode | `adjustResize` + edge-to-edge | Device test, like critic I4 |

### 4.6 Navigation, tab bar, status bar
**Plain English:** v1 keeps Vibe's own bottom tab bar, which already respects the notch and home bar. It adds
iPhone swipe-back and the Android back button. A true native tab bar is a half-day experiment. If it works,
it's the strongest "this is a real app" signal for Apple's reviewer.

- **Safe areas:** already in place. `viewportFit: "cover"` (`src/app/layout.tsx:39–44`) and 57
  `env(safe-area-inset-*)` uses in `src/`. Capacitor 8's `SystemBars` makes Android edge-to-edge and exposes
  insets through CSS/`env()` (`adjustMarginsForEdgeToEdge` was removed, 8.0 update guide). Use
  `@capacitor/status-bar` for dark text on cream.
- **iOS swipe-back:** Capacitor core never turns on `allowsBackForwardNavigationGestures` (not present in
  `CAPBridgeViewController.swift`, main). Subclass it (`MainViewController.swift`, ~10 lines) and set
  `webView?.allowsBackForwardNavigationGestures = true`. Next's `pushState` entries go into WebKit's
  back-forward list. How smooth that feels is UNVERIFIED; check on a device.
- **Android back button:** `@capacitor/app` calls `webView.goBack()` when it can go back, otherwise it exits
  (`AppPlugin.java:46–69`, capacitor-plugins main).
- **Native tab bar (optional spike):**
  - `@capgo/capacitor-native-navigation` 8.4.0 drives `UITabBarController`/`UITabBar` from JS, with iOS 26
    Liquid Glass and one web view. Its README describes it as "Native navbar, tabbar, safe-area handling, and
    WebView snapshot transitions" (https://github.com/Cap-go/capacitor-native-navigation). It's young: created
    2026-05-10, 36 stars, MPL-2.0.
  - Adopt it only if a ½-day spike wires `tabSelect` → Next `router.push` cleanly and the web
    `MobileTabBar` hides in the app. Otherwise ship the web bar and keep this as the reply if Apple cites 4.2.
- **iPad:** ship **iPhone-only** in v1 (decision D4). An iPhone app still runs on iPad in compatibility mode,
  so it must not break there.

### 4.7 "Am I inside the app?" (for the web code)
**Plain English:** the app adds "VibeApp" to its browser signature, and the server and the page both look for
it. The new PWA detector has to learn it, or it will coach app users to "Add to Home Screen".

- **Signals:** the user-agent suffix (`VibeApp/1 (ios|android)`, readable in `src/proxy.ts` and on the
  client) and `window.Capacitor?.isNativePlatform()` on the client.
- **Conflict:** `src/lib/pwa/display-mode.ts:103–115` sorts a WKWebView user agent (no `Safari` token) as
  `"ios-safari"`, and an Android WebView (`; wv)`) as `"android-other"`. `isStandalone` is false in both.
  Wave 3's coach would then show inside the store app.
- **Fix:** add `"ios-app" | "android-app"` to `Platform`, checked **before** the in-app-browser rule, and pin
  it in `display-mode.test.ts`.
- **App mode hides:** the install coach, web-push toggles, `beforeinstallprompt` UI, Vibe+ buy buttons
  (D3), and the "email links open Safari" copy (R16), which becomes "enter the code, or tap the link on this
  phone".
- **App mode adds:** a native push toggle and `leaveDeviceClean` for the FCM token.

### 4.8 Building and signing on this Mac, and CI
**Plain English:** the iPhone app builds on this Mac today. The Android app needs Android Studio installed
first, which takes about an hour. Both first builds can be made and uploaded by hand. Automated builds
can wait until after launch.

- **Checked 2026-09-24:**
  - Present: Xcode 26.4.1 (17E202), macOS 26.6.2 on arm64, Node v25.9.0, npm 11.12.1, Oracle JDK 23.0.1.
  - Absent: CocoaPods, Android Studio, the Android SDK, `adb`.
- **CocoaPods isn't needed.** Capacitor 8 makes SPM the default for new iOS projects, and the Firebase SDK
  comes in through SPM too. There is an open bug where SPM plugin products aren't exposed in Xcode
  (https://github.com/ionic-team/capacitor/issues/8325). UNVERIFIED whether it hits our plugin set; fall back
  to CocoaPods (`brew install cocoapods`) if it does.
- **Android:**
  - Install Android Studio Otter 2025.2.1 or newer, then SDK Platform 36 and an emulator image.
  - Point `JAVA_HOME` at Android Studio's bundled JBR (JDK 21) for Gradle 8.14.3 / AGP 8.13. Don't use the
    system JDK 23 (UNVERIFIED compatibility).
- **Node:** Capacitor 8 needs 22+. Node 25 is a "current" release, not LTS. If the CLI misbehaves, pin Node 24
  LTS for `mobile/` only (UNVERIFIED).
- **iOS signing:** Xcode automatic signing under the CONNECTVIBE team. Capabilities: Push Notifications and
  Associated Domains. Upload from Xcode Organizer. TestFlight internal testers (App Store Connect users) need
  no Beta App Review; external testers do (UNVERIFIED how long).
- **Android signing:**
  - Create an upload keystore and keep it in the founders' password manager with a backup.
  - Use Play App Signing (Google holds the app-signing key).
  - Put both SHA-256 fingerprints in `assetlinks.json`.
  - Upload an `.aab` to the **internal testing** track (up to 100 testers). The 12-testers/14-days rule covers
    closed testing before production, and only on personal accounts made after 2023-11-13
    (https://support.google.com/googleplay/android-developer/answer/14151465).
- **CI options** (none needed for launch; prices fetched 2026-09-24):

| Service | Cost | Fit |
|---|---|---|
| Xcode Cloud | 25 compute hours/month included with the Developer Program; 100 h = $49.99/mo (https://developer.apple.com/xcode-cloud/) | iOS only; simplest for TestFlight |
| Codemagic | 500 free macOS M2 minutes/month (personal, 1 concurrent); then $0.095/min M2 (https://codemagic.io/pricing/) | Both platforms; supports Ionic/Capacitor |
| GitHub Actions | macOS $0.062/min, Linux 2-core $0.006/min (https://docs.github.com/en/billing/reference/actions-runner-pricing) | Both; Fastlane scripts to maintain |
| EAS Build | Free 15+15 builds/mo; $19/mo Starter (https://expo.dev/pricing) | Built for Expo. Not for Capacitor; right for the later native app |
| Ionic Appflow | **Winding down:** new sales stopped 2025-02-11, access ends 2027-12-31 (https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products, 2025-02-11). Third-party reports of "no new apps from 2026-10-01" are UNVERIFIED | **Don't adopt.** Ionic points to Capawesome Cloud (pricing UNVERIFIED) |

### 4.9 Minimum versions
- **iOS 15.0+** (Capacitor 8). Apple's own floor is iOS 13 (from 2026-09-09, upcoming-requirements page), so
  Capacitor's is the binding one.
- **Android 7.0 / API 24+**, target/compile API 36. `android.minWebViewVersion` defaults to 60: older
  WebViews get `errorPath`.
- **Web push reference, for comparison:** the Home Screen web app needs iOS 16.4+. The store app has no
  such limit.

---

## 5. Where the code lives

### Plain English
Keep the app in this repo, in its own `mobile/` folder with its own packages, so the website build never sees
it. The website and the app change together: link files, "am I in the app" checks, push tokens. One repo
lets one person, or one agent, see both sides.

```
mobile/                          # own package.json; NOT an npm workspace (keeps Vercel's install unchanged)
  package.json                   # @capacitor/{cli,core,ios,android} 8.5.x + plugins, pinned exactly
  capacitor.config.ts            # §4.1; a separate dev config for LAN + local Supabase
  www/index.html                 # required webDir placeholder (never shown when server.url is set)
  www/offline.html               # errorPath page; same look as public/offline.html (wave 1B)
  resources/icon.png, splash.png # input for @capacitor/assets
  ios/App/App/MainViewController.swift   # swipe-back; later the native tab bar
  ios/App/App/App.entitlements           # aps-environment, applinks:www.connectvibe.app
  ios/App/App/GoogleService-Info.plist   # from Firebase (not secret, but keep out of public view)
  android/app/src/main/AndroidManifest.xml  # autoVerify intent filters, POST_NOTIFICATIONS
  android/app/google-services.json
  README.md                      # build, sign, upload steps
public/.well-known/apple-app-site-association   # JSON, no extension
public/.well-known/assetlinks.json
src/lib/native/detect.ts (+ .test.ts)          # pure: isNativeApp(ua), nativePlatform(ua)
src/components/native/NativeBridge.tsx          # "use client": links, back, push token, link interceptor
src/app/api/me/device-token/route.ts            # POST/DELETE FCM token (service-role table)
```

- Edits outside `mobile/`:
  - `src/app/layout.tsx`: mount `NativeBridge`.
  - `src/lib/pwa/display-mode.ts`: add `ios-app` / `android-app`.
  - `src/proxy.ts`: add `.well-known` to the matcher.
  - `next.config.ts`: AASA content type.
  - `tsconfig.json`: exclude `mobile` (its `include` is `**/*.ts`, `tsconfig.json:25–33`).
  - `eslint.config.mjs`: `globalIgnores` adds `mobile/**`.
  - `.vercelignore`: add `mobile/`.
  - A Vercel "Ignored Build Step" so native-only commits don't redeploy.
- A separate repo is the choice only if the native project gets its own contributors. It can split out later
  without changing the store listing.

---

## 6. Day-by-day estimate to first TestFlight and Play internal test

### Plain English
About 7 working days of engineering, and days 1–4 can start right away. Nothing blocks until push and link
testing on a real phone, which needs the paid Apple account. Start account enrollment today, because it's the
slowest step and can't be sped up. Leave room for one Apple rejection round before October 31.

| Day | Work | Needs |
|---|---|---|
| 0 (today, non-code) | Choose permanent IDs (D1). Check or request the LLC's D-U-N-S: "allow up to 5 business days" from D&B, then "up to 2 business days for Apple to receive your information", and "Expediting … will not shorten this waiting period" (https://developer.apple.com/help/account/membership/D-U-N-S/). Enroll Apple Developer as an organization ($99/yr; the work email must be on the org's domain, e.g. @connectvibe.app; https://developer.apple.com/programs/enroll/). Create the Play Console org account and a Firebase project | James (bank, legal) + Franky |
| 1 | Install Android Studio + SDK 36. Scaffold `mobile/` (Capacitor 8.5.x, `cap add ios/android`). Config per §4.1. Icons and splash. `offline.html`. Run in the iOS Simulator and Android emulator against local `next dev` | Nothing paid |
| 2 | Web side: `detect.ts` + tests, `NativeBridge` (links, back, status bar, new-window interceptor, `Browser`), the app branch in `display-mode.ts`, hide coach / web push / buy. Swipe-back subclass | — |
| 3 | The four fixes (§4.5): `.ics` via Share, résumé "Open file", `_blank`, Stripe hidden. Keyboard and safe-area pass on both platforms. Optional ½-day native tab-bar spike | — |
| 4 | Link files: `.well-known` files, proxy matcher, header, entitlements, intent filters. Test with `xcrun simctl openurl` and `adb … verify-app-links` | Apple team ID for AASA |
| 5–6 | Push: APNs key → Firebase, plugin, `device-token` route + migration (Franky's yes; code first, as in house rules), FCM sender behind wave 2's dispatcher (or a founder-only test sender if wave 2 isn't in yet), channels, in-context ask, tap routing | Paid Apple account, Firebase |
| 7 | Sign and upload: App Store Connect record → archive → **TestFlight internal**. Keystore + Play App Signing → `.aab` → **Play internal testing** | Both accounts active |
| 8–9 | Real-device pass (§8), fixes, store screenshots from seeded local accounts only, App Review notes + demo account, submit | — |

- **Review time:** Apple says "On average, 90% of submissions are reviewed in less than 24 hours"
  (https://developer.apple.com/distribute/app-review/). Plan for one 4.2 rejection round (3–5 days).
  **Submit by ~Oct 20.**
- Play's review time for a new app on a new account is UNVERIFIED; budget up to a week.

---

## 7. Decisions for Franky

- **D1. Permanent app IDs.** Recommend `app.connectvibe.vibe` as both the iOS bundle ID and the Android
  package name. They can never change. A future Expo/native app ships as an update under the same IDs and
  signing keys.
- **D2. Android wrapper.**
  - (a) Capacitor, same as iOS. **Recommended:** one bridge, one push path, one "in the app" mode.
  - (b) TWA via Bubblewrap. One day of work, and it reuses the PWA's web push.
  - Keep (b) as the fallback.
- **D3. Vibe+ inside the store apps at launch.**
  - (a) No buy button in the apps. **Recommended**, because production selling is off anyway.
  - (b) A US-storefront link out to the web (allowed by 3.1.1(a) today; legally in flux).
  - (c) Apple in-app purchase + Play Billing (weeks of work and a store commission). Payments research decides.
- **D4. iPhone-only (recommended) or iPhone + iPad** for v1.
- **D5. Native tab bar:** try the ½-day spike (recommended). Keep the web tab bar if it fights the Next router.
- **D6. Push order:** FCM (store apps) before web push (desktop). Recommended; it re-scopes PWA wave 2's sender.

---

## 8. Must test on real phones (can't be settled from here)

- N1. Sign in inside the app, force-quit and relaunch: still signed in. Check again after 8+ days (ITP cap, §4.4).
- N2. Confirm, reset and school-verify emails, tapped in Apple Mail, Gmail and Outlook on iPhone and Android:
  does the app open and finish sign-in? Does an IU/Purdue inbox wrap links (Safe Links)?
- N3. Push on a locked phone. Tapping it opens the right thread. Badge count. Android 13+ permission flow.
- N4. Photo, video and camera pickers; post and message uploads; résumé upload (PDF).
- N5. `.ics` through the share sheet: is Calendar offered?
- N6. Swipe-back on iPhone and the Android back button across Campus → post → profile → back.
- N7. Keyboard up and down in Messages and the composer.
- N8. Airplane mode at launch and mid-session: `errorPath` page, then recovery.
- N9. The app on iPad (compatibility mode) doesn't break.
- N10. Wave 3's install coach and web-push toggle never appear inside the app.

---

## 9. Open questions and UNVERIFIED items
- Median / MobiLoud prices (pricing page blocked automated fetch).
- `server.appStartPath` combined with a remote `server.url`.
- Capacitor SPM issue #8325 against our plugin set.
- Whether IU / Purdue Microsoft 365 rewrite links.
- Production Supabase `SiteURL`.
- Gradle on JDK 23; Capacitor CLI on Node 25.
- External TestFlight review time; Play's new-app review time.
- Capawesome Cloud pricing.
- That Play organization accounts are exempt from the 12/14 rule. Secondary sources say yes; Google's page
  only names personal accounts.
- How long Apple org enrollment takes after D-U-N-S.

## 10. Sources (fetched 2026-09-24 unless dated)
- Capacitor:
  - https://ionic.io/blog/announcing-capacitor-8 (2025-12-08)
  - https://capacitorjs.com/docs/updating/8-0
  - https://capacitorjs.com/docs/config
  - https://capacitorjs.com/docs/apis/push-notifications
  - https://github.com/ionic-team/capacitor (main: `WebViewDelegationHandler.swift`, `CAPBridgeViewController.swift`, `Bridge.java`, `BridgeWebChromeClient.java`, `cli/src/declarations.ts`)
  - https://github.com/ionic-team/capacitor/discussions/4080
  - https://github.com/ionic-team/capacitor/issues/5478 and /4122 and /8325
  - https://github.com/capawesome-team/capacitor-firebase/tree/main/packages/messaging
  - npm registry (versions, 2026-09-24)
- Apple:
  - https://developer.apple.com/app-store/review/guidelines/
  - https://developer.apple.com/documentation/xcode/supporting-associated-domains
  - https://developer.apple.com/news/upcoming-requirements/
  - https://developer.apple.com/programs/enroll/
  - https://developer.apple.com/help/account/membership/D-U-N-S/
  - https://developer.apple.com/distribute/app-review/
  - https://developer.apple.com/xcode-cloud/
  - https://developer.apple.com/forums/thread/780496
- WebKit:
  - https://webkit.org/blog/10882/app-bound-domains/ (2020-06-26)
  - https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/
- Google / Android:
  - https://developer.android.com/training/app-links/verify-android-applinks (2026-09-16)
  - https://developer.android.com/develop/ui/views/notifications/notification-permission
  - https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2 (2026-02-26)
  - https://support.google.com/googleplay/android-developer/answer/9899034
  - https://support.google.com/googleplay/android-developer/answer/11926878
  - https://support.google.com/googleplay/android-developer/answer/14151465
  - https://support.google.com/googleplay/android-developer/answer/15582165 (2026-09-17)
  - https://github.com/GoogleChromeLabs/bubblewrap/issues/730
- Other:
  - https://nextjs.org/docs/app/guides/static-exports (2026-08-25)
  - https://expo.dev/changelog/sdk-57 (2026-06-30)
  - https://docs.expo.dev/router/advanced/native-tabs/
  - https://expo.dev/pricing
  - https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md
  - https://github.com/pwa-builder/pwabuilder-ios (archived)
  - https://docs.median.co/docs/licenses (2026-09-10)
  - https://codemagic.io/pricing/
  - https://docs.github.com/en/billing/reference/actions-runner-pricing
  - https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products
  - https://github.com/Cap-go/capacitor-native-navigation
  - https://learn.microsoft.com/en-us/defender-office-365/safe-links-about
  - https://developer.mozilla.org/en-US/docs/Web/API/PushManager
- Legal status:
  - https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html
  - Supreme Court docket No. 25-1311 (Apple merits brief 2026-09-14)
