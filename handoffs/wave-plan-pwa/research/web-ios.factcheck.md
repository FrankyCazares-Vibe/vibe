# Fact-check: web-ios.md (iPhone/iPad rules for installable web apps)

Checked 2026-09-24 against primary sources: Apple release-notes JSON, the Apple web-push doc, webkit.org posts, WebKit Bugzilla REST,
WebKit source on GitHub (main), the W3C Push API TR, the WHATWG Notifications spec, MDN browser-compat-data (main), the npm registry
plus web-push 3.6.7 tarball source, nextjs.org docs, and the installed `next@16.3.4`. The research file was not edited.

**Result: 36 claims checked. 22 CONFIRMED, 9 CORRECTED, 5 UNVERIFIED.**

## The corrections that change the build (read these first)

1. **Declarative push payload shape is wrong in the research (§c example, checklist 16).** `mutable` and `app_badge` belong at the
   **top level** of the JSON, next to `web_push`, not inside `notification`.
   - W3C Push API WD 2025-12-01 parser: `If message["mutable"] exists and ... is a boolean, then set mutable` (top-level `message`). https://www.w3.org/TR/push-api/
   - WebKit `NotificationJSONParser.cpp` (main) reads `app_badge` from `outerObject` only. It reads `mutable` from the top level, with an inside-`notification`
     fallback marked "non-standard" and slated for removal (webkit.org/b/297389). https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/notifications/NotificationJSONParser.cpp
   - `app_badge` moved to the top level on 2025-05-23 ("Relocate 'app_badge' entry from the 'notification' dictionary to the top level JSON", 295319@main, https://bugs.webkit.org/show_bug.cgi?id=293457).
     The WebKit blog example (Mar 2025) is out of date. `app_badge` may be a string or a non-negative number.
   - Safe cross-version payload: `{"web_push":8030,"notification":{"title","body","navigate","tag"},"app_badge":N}`. Optionally also put
     `app_badge` inside `notification` for iOS 18.4–18.x, because neither parser rejects unknown keys (my reading of the source; test it).
2. **A service worker's `push` event does NOT fire for a declarative message unless top-level `"mutable": true`.** The research says it fires whenever a root-scope worker exists.
   - W3C WD: "If declarativeResult's mutable is true and registration is non-null: ... firing a push event". Otherwise the notification is shown directly.
   - WebKit `webpushd/WebPushDaemon.mm`: "a declarative push message without the mutable flag set ... we can just display its notification right now".
   - The WebKit blog's "a push event is dispatched to it like before" is superseded by the spec and the source.
   - Build impact: with non-mutable pushes, the service worker's `push` handler only runs on iOS 16.4–18.3, Chrome, Firefox and other non-declarative browsers. That's fine, but don't expect it on iOS 18.4+.
3. **"Nothing new for push in iOS 26.x" is false.** Safari 26.2 notes (Dec 12, 2025): "Fixed reading the `mutable` field from the outer object
   instead of as a child of `notification`. (157475553)". https://developer.apple.com/documentation/safari-release-notes/safari-26_2-release-notes
4. **`web-push` (npm) does not "handle all of this".** It's still right to use it, but know what it does:
   - Latest is 3.6.7, published 2024-01-16. There has been no release since, though the repo is not archived and was pushed to on 2026-09-21. https://www.npmjs.com/package/web-push
   - It signs a **new VAPID JWT on every send** (`getVapidHeaders` → `jws.sign` per call, no cache). Apple's doc says "Don't refresh your JWT more frequently than once per hour."
     Whether Apple enforces this is UNVERIFIED. To comply, cache the `Authorization` header per audience for about 1h and send with your own `fetch`, or accept the risk.
   - It **overwrites** any `Content-Type` you pass in `options.headers` with `application/octet-stream` when there's a payload (`web-push-lib.js`, 3.6.7). So checklist 16's "also send `application/notification+json`" can't be done with it as written.
   - Its defaults are compatible with Apple: TTL 2419200 s (28 days, within Apple's 30), JWT exp 12h (max 24h), subject must be `https:` or `mailto:`.
   - Node runtime is required. It uses `crypto.createECDH` and `https`. CONFIRMED from source.
5. **`TTL` must be present and positive.** Apple's `BadTtl`: "The `TTL` header is either missing or isn't a positive number". So `TTL: 0` is rejected. Use ≥ 1.

## All checked claims

| # | Claim (research §) | Verdict | Primary source / note |
|---|---|---|---|
| 1 | Safari 27 / iOS 27 released 2026-09-14 (header) | CONFIRMED | Safari 27 notes abstract: "Released September 14, 2026 — 27.0 (20625.1.29)" |
| 2 | Safari 27 has no web-app / push / manifest / badging changes (summary 2) | CONFIRMED | 27 notes have no Web Apps section. WebKit 18325 (Sep 17, 2026) and 17967 (Jun 8, 2026) are silent too. Only "Fixed incorrect URL parser invocation on the `Notification` object" (176762955) |
| 3 | iOS 26: any site added opens as a web app by default, the toggle makes a bookmark, "zero requirements" (§a) | CONFIRMED | Safari 26 notes (113034903); https://webkit.org/blog/17333/ (Sep 15, 2025) |
| 4 | Apple Support install steps (More → Share, the Tabs Bottom/Top variant, Edit Actions, Open as Web App) | CONFIRMED | https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios (iOS 27 page) |
| 5 | `beforeinstallprompt` unsupported on iOS | CONFIRMED | BCD `api/BeforeInstallPromptEvent`, `Window.beforeinstallprompt_event`: false |
| 6 | Manifest table: name/short_name/start_url/scope/standalone 11.3; fullscreen/minimal-ui/display_override/background_color/orientation/share_target not supported; shortcuts false; id 16.4; icons 15.4 with apple-touch-icon precedence; theme_color 15 | CONFIRMED | BCD `manifests/webapp/*` (mirror → safari); https://webkit.org/blog/12445/ "apple-touch-icon takes precedence" |
| 7 | SVG and data-URL icons everywhere, incl. Home Screen, iOS 26 | CONFIRMED | WebKit 17333, "SVG icons" section |
| 8 | Safari 17.2 icon guidance quotes (maskable 1024, don't UA-sniff apple-touch-icon) | CONFIRMED | Safari 17.2 notes (102449619) |
| 9 | `display-mode` "can match `fullscreen` instead of `standalone`" (§a) | **CORRECTED** | BCD `css/at-rules/media` safari_ios: "In an installed web application with ... `standalone`, `display-mode: standalone` is **false** and `display-mode: fullscreen` is true" (bug 264218, created 2023-11-04). This is systematic, not occasional. Also: other values are true "only when given by a supported manifest `display` member value". The research's 3-way check stays correct. |
| 10 | WebKit 301108 is evidence that `black-translucent` + `viewport-fit=cover` breaks in standalone (§a, §e) | **CORRECTED** | The bug (NEW, 2025-10-20) is about the Safari *browser* tab under the iOS 26 see-through address bar. It doesn't mention standalone mode or the status-bar meta. The standalone `black-translucent` claim rests only on third-party reports (UNVERIFIED). "Prefer `default`" is still a reasonable call. https://bugs.webkit.org/show_bug.cgi?id=301108 |
| 11 | Cookies copied at install on iOS 17.2+; separate afterwards; localStorage not copied | CONFIRMED (iOS part) | Safari 17.2 notes (104438319). The WWDC23 10120 "separate" and "local storage is not copied" quotes were said about Mac web apps; see U5 |
| 12 | Email links open the default browser; out-of-scope links open SFSafariViewController on iOS; link capture is macOS-only | CONFIRMED | WWDC23 10120 transcript (quotes verbatim); Safari 18.0 notes "opening links directly in web apps on macOS" (113034778); no iOS equivalent in 18.x/26.0–26.5/27 notes |
| 13 | Storage: 60% per origin / 80% overall, same for Home Screen apps, `persist()` heuristic; Home Screen apps have their own 7-day counter; `document.cookie` 7-day cap | CONFIRMED | https://webkit.org/blog/14403/ ; https://webkit.org/blog/10218/ ; https://webkit.org/blog/8613/ |
| 14 | No Developer Program needed; gesture required; invisible pushes revoke permission; allow `*.push.apple.com` | CONFIRMED | https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers ; https://webkit.org/blog/13878/ |
| 15 | VAPID key must match; JWT ≤ once/hour; BadJwtToken causes (sub URL/mailto, aud, exp > 1 day); Urgency values; Topic ≤ 32 base64url chars; 4 KB; 410 expired; 429; HTTP/1.1 ≤ 100 unacknowledged; SNI; ≤ 30 days storage | CONFIRMED | Apple web-push doc (headers and error tables, verbatim) |
| 16 | "`TTL` is required (`BadTtl`)" | **CORRECTED** | Required **and positive**; `TTL: 0` is rejected (see correction 5) |
| 17 | Version history: push + Badging + manifest `id` + third-party Add to Home Screen in 16.4; 17.5 push fix; 18.2 empty-endpoint fix; Declarative Web Push iOS 18.4 (141082392), macOS 18.5 (148109003) | CONFIRMED | Safari 16.4 / 17.5 / 18.2 / 18.4 / 18.5 notes (release dates match) |
| 18 | "Nothing new for push in iOS 26.x or 27" | **CORRECTED** | Safari 26.2 changed where `mutable` is read (see correction 3) |
| 19 | Declarative payload with `mutable` and `app_badge` inside `notification` | **CORRECTED** | Both are top level (see correction 1) |
| 20 | A root-scope service worker's `push` event fires with the proposed notification | **CORRECTED** | Only when `"mutable": true` (see correction 2) |
| 21 | W3C Push API WD 2025-12-01 defines declarative messages; requires `web_push: 8030`, `title`, `navigate`; `Window includes PushManagerAttribute` | CONFIRMED | https://www.w3.org/TR/push-api/ . Note: the WD does **not** define `app_badge`; that's WebKit-only for now |
| 22 | `window.pushManager` on iOS 18.4, sharing the subscription with a root-scope service worker; non-Apple browsers get an ordinary push | CONFIRMED | WebKit 16535; BCD `Window.pushManager`: safari_ios 18.4, Chrome/Edge/Firefox false |
| 23 | `Content-Type: application/notification+json` "harmless to send", required-ness UNVERIFIED | **CORRECTED** | Not required. webpushd detects declarative messages by parsing the decrypted payload for `web_push: 8030`, with no header check (`WebPushDaemon.mm`). The media type exists only in the WebKit explainer; the spec and blog never use it. And `web-push` overwrites the header anyway (correction 4) |
| 24 | Quote: "the fallback content displays automatically" (WebKit 16535) | **CORRECTED** | Misquote, but the substance holds. Actual text: "If the event handler fails to display a replacement notification in time, the fallback is used." |
| 25 | Unsupported on iOS: notification `actions`, `image`, `badge` (280160), `requireInteraction`, `pushsubscriptionchange` | CONFIRMED | BCD `api/Notification`, `ServiceWorkerRegistration.showNotification` options, `ServiceWorkerGlobalScope.pushsubscriptionchange_event` |
| 26 | BCD lists `notificationclick` as unsupported on iOS; may be a gap | UNVERIFIED | See U1 |
| 27 | "The standard `web-push` npm library handles all of this"; Node runtime | **CORRECTED** | Node runtime confirmed; per-send JWT and Content-Type overwrite (see correction 4) |
| 28 | Badge permission auto-granted with notifications; `setAppBadge(0)` clears | CONFIRMED | https://webkit.org/blog/13966/ ; BCD `Navigator.setAppBadge` note |
| 29 | WebKit bugs 272325, 268643, 280160, 194593, 230225: status and dates as stated | CONFIRMED | Bugzilla REST (264218 was created 2023-11-04 and last changed 2023-11-11) |
| 30 | EU: reversal 2024-03-01; `SFAddToHomeScreenInfo` in iOS 18.2; DMA page has no web-app text and mentions terms effective Oct 1, 2026 | CONFIRMED | Apple docs `SFAddToHomeScreenInfo` introducedAt iOS 18.2; https://developer.apple.com/support/dma-and-apps-in-the-eu/ . The reversal quote survives only via TechCrunch and 9to5Mac |
| 31 | Wake Lock works in Home Screen apps from 18.4; `webkitdirectory` on iOS in 18.4; 26.2 Home Screen audio fix | CONFIRMED | Safari 18.4 notes (108573133); WebKit 16574; Safari 26.2 notes (155336513) |
| 32 | `src/app/manifest.ts` is served at `/manifest.webmanifest` | CONFIRMED | `next@16.3.4` `is-metadata-route.js` (`MANIFEST_WEBMANIFEST_REGEX`). Note: Next's `appleWebApp` emits `mobile-web-app-capable`, **not** `apple-mobile-web-app-capable` (nextjs.org generate-metadata docs). That's harmless on iOS 26+, and a manifest `display: standalone` covers older iOS |
| 33 | Instagram/TikTok/Snapchat web views have no Add to Home Screen | UNVERIFIED | See U2 |
| 34 | 3 silent pushes → subscription revoked | UNVERIFIED | See U3 |
| 35 | Universal Links / AASA apply to native apps only | UNVERIFIED | See U4 |
| 36 | localStorage not copied on iOS | UNVERIFIED | See U5 |

## Unverifiable (test on a device or treat as risk)
- **U1 `notificationclick` on iOS.** BCD says false, but in the same data `NotificationEvent` is iOS 16.4+, which is inconsistent. No Apple statement either way.
  The WHATWG spec says a notification with a `navigate` URL navigates directly and skips `notificationclick`, and the WebKit explainer says declarative notifications "always skip" it.
  So pass `navigate` in `showNotification` options as well as handling `notificationclick`.
- **U2 In-app browsers.** WWDC23: "users can add Home Screen web apps in iOS browsers and many in-app browsers". That covers apps using SFSafariViewController (iOS 17+).
  Whether Instagram/TikTok/Snapchat's own web views offer it has no primary source.
- **U3 "3 strikes" silent-push count.** Only dev.to/progressier. Apple says only that permission is revoked.
- **U4 Universal Links for web apps.** No Apple statement found. Safari 18.0 notes do say "Fixed resolving `www.` sub-domain for Associated Domains for all web apps" (121216556), so "native only" isn't clean.
- **U5 localStorage copy on iOS.** WWDC23's statement is about Mac. There's no iOS primary source.
- Also still UNVERIFIED, as the research already says: `black-translucent` in standalone on 26/27; launch settings cached at install; `apple-touch-startup-image` as the only splash;
  an in-scope redirect closing the SFSafariViewController sheet (Stripe return); `mailto:…@localhost` rejection; which Safari first shipped the top-level `app_badge` (likely 26.0);
  whether Apple enforces the once-per-hour JWT rule.
