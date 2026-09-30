# Fact-check: wrapper-tech.md (2026-09-24)

Adversarial pass over the claims a decision rests on. Each was checked against a primary source today
(npm registry, GitHub API/raw source, Apple/Google/Expo/Capacitor docs, supremecourt.gov docket).
Verdicts: **CONFIRMED**, **CORRECTED** (with the right statement + URL), **UNVERIFIED** (no primary source found).
The research file was not edited.

**Totals: 40 claims checked. 34 confirmed, 6 corrected. 8 items unverified. 4 omissions flagged.**

## Corrections (read these first)

1. **Capacitor 8.5.2 "published 2026-09-24"** is wrong. `@capacitor/core|cli|ios|android` 8.5.2 were published
   **2026-09-11**. The 2026-09-24 publish was the nightly `8.5.3-nightly-20260924T151329.0`. 8.5.2 is still `latest`.
   Source: https://registry.npmjs.org/@capacitor/core (time + dist-tags).
2. **Expo native tabs "unstable in 55–57, stable from SDK 58"**: the docs say `unstable-native-tabs` covers
   **SDK 54 through 57**. More important: **SDK 58 is not released.** npm has `latest` = 57.0.25 and
   `next` = `58.0.0-preview.6`. So stable native tabs mean a preview SDK today.
   Sources: https://docs.expo.dev/router/advanced/native-tabs/ (modified 2026-09-16), https://registry.npmjs.org/expo.
3. **Epic v. Apple framing ("largely upheld … the rule may change after launch")** is incomplete in a way that
   matters for D3(b). The Ninth Circuit (2025-12-11) **affirmed the contempt finding but vacated the
   zero-commission ban** and remanded. The district court is now setting a commission on linked-out US purchases.
   Apple proposed 15% / 10% / 5% (Small Business) on 2026-08-13. The Supreme Court **granted cert 2026-06-30 on both
   questions** (the contempt "spirit" standard, and complete relief under *Trump v. CASA*). It denied a stay of the
   mandate (No. 25A1213, May 2026) and declined to pause the remand. Apple's merits brief was filed 2026-09-14
   (confirmed). Net: a US link-out may become commission-bearing **through the remand, before any Supreme Court
   ruling**. Guideline 3.1.1(a) text today still says no entitlement is needed in the US storefront (confirmed).
   Sources: https://www.supremecourt.gov/DocketPDF/25/25-1311/424150/20260914154510009_2026-09-14%20No.%2025-1311%20Apple-Epic%20Merits%20Opening%20Brief.pdf ;
   https://ipwatchdog.com/2026/06/30/high-court-grants-cert-in-apples-challenge-to-ninth-circuit-contempt-ruling-in-app-store-dispute/ ;
   https://www.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-federal-court/ ;
   https://9to5mac.com/2026/08/13/apple-proposes-commissions-of-up-to-15-for-off-app-store-purchases-in-the-us/
   (secondary sources; Justia returned 403). Whether any commission is charged today is disputed between secondary
   sources, so it stays UNVERIFIED.
4. **Critical path "D-U-N-S … up to 7 business days"** is right for Apple (5 + 2 business days, quoted verbatim).
   But the plan also creates a **Play Console organization account**, which **also requires a D-U-N-S number**.
   Google's page warns getting one "can take up to 30 days". Payment-profile verification "can take up to
   5 days". There is also a one-time **$25** registration fee, which is missing from every cost line.
   Sources: https://support.google.com/googleplay/android-developer/answer/13628312 ;
   https://developer.apple.com/help/account/membership/D-U-N-S/
5. **"There is an open bug where SPM plugin products aren't exposed in Xcode (#8325)"**: the issue was
   **closed as completed on 2026-03-05** and locked on 2026-04-18. A later comment reports a runtime
   "missing plugin" error after `cap sync`, so a device check is still worth doing, but it is not an open bug.
   Source: https://github.com/ionic-team/capacitor/issues/8325 (GitHub API: state=closed, state_reason=completed).
6. **"Android back button: `@capacitor/app` calls `goBack()` when it can, otherwise it exits"** is wrong. The default
   handler only calls `goBack()` when `canGoBack()`. Otherwise it does **nothing**: the press is consumed and the
   app does **not** exit. Docs: registering a `backButton` listener disables the default; "If you want to close the
   app, call App.exitApp()". So NativeBridge needs a `backButton` listener: go back if you can, else `App.exitApp()`.
   Source: https://github.com/ionic-team/capacitor-plugins/blob/main/app/android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java (lines 46–59);
   https://capacitorjs.com/docs/apis/app

## Confirmed

| # | Claim | Evidence |
|---|---|---|
| 7 | Capacitor 8 announced 2025-12-08 | npm `@capacitor/core` 8.0.0 published 2025-12-08 |
| 8 | Capacitor 8 needs Node 22+, Xcode 26+, iOS 15, minSdk 24, compile/target 36, AGP 8.13.0, Gradle 8.14.3, AS Otter 2025.2.1; SPM default; iOS `appendUserAgent` whitespace fix; `adjustMarginsForEdgeToEdge` removed → SystemBars | capacitorjs.com/docs/updating/8-0 |
| 9 | `server.url` "intended for use with live-reload servers … not intended for use in production"; `allowNavigation` carries the same "not intended for use in production" line | capacitorjs.com/docs/config |
| 10 | `appStartPath` @since 7.3.0; `errorPath` "On Android the html file won't have access to Capacitor plugins"; `minWebViewVersion` default 60 → redirects to `errorPath` | capacitorjs.com/docs/config |
| 11 | iOS: non-`server.url` navigations → `UIApplication.shared.open` (`isApplicationNavigation`, a startsWith check); new-window → Safari (`createWebViewWith`, :334–336); cookie observer at `CAPBridgeViewController.swift:121` | raw source on main |
| 12 | Push plugin token: "On iOS it contains the APNS token. On Android it contains the FCM token." Small icon should be "white pixels on a transparent backdrop" | capacitorjs.com/docs/apis/push-notifications |
| 13 | `@capacitor-firebase/messaging` gives FCM tokens on both, needs the APNs key in Firebase, AppDelegate hooks, and supports SPM. Note: SPM `packageOptions` needs Capacitor CLI **8.4.0+** | capawesome-team/capacitor-firebase README |
| 14 | Plugin versions: app 8.1.1, status-bar 8.0.3, splash-screen 8.0.2, browser 8.0.4, share 8.0.2, haptics 8.0.2, keyboard 8.0.5, push-notifications 8.1.2, firebase/messaging 8.5.2, assets 3.0.5 (last published 2024-03-29; repo active) | npm registry |
| 15 | PWABuilder iOS repo archived, last push 2025-06-10, README "community driven fashion"; push commented out (issue #6, open). The repo was renamed to `pwabuilder-ios-app-store` | GitHub API |
| 16 | `@bubblewrap/cli` 1.25.0 released 2026-07-31; PR #731 (Android 13 prompt) merged 2022-12-12 | npm, GitHub API |
| 17 | Expo SDK 57 = React Native 0.86, changelog 2026-06-30; `expo` 57.0.25 (published today) | expo.dev/changelog/sdk-57, npm |
| 18 | EAS: Free 15+15 builds, low-priority "90+ minutes" at peak; Starter $19/mo; PAYG $1–$4 per build | expo.dev/pricing |
| 19 | `react-native-webview` 14.0.1 has every listed prop; `onFileDownload` "is iOS-only" | npm, docs/Reference.md |
| 20 | Next.js static export excludes cookies, Request-reading route handlers, Proxy, server actions, redirects/headers/rewrites, default image loader, dynamic routes without `generateStaticParams`; docs 16.3.6, updated 2026-08-25 | nextjs.org (markdown) |
| 21 | Guideline quotes 4.2, 4.2.2, 2.5.2, 4.7, 1.2 (four UGC items), 5.1.1(v), 4.8 (third-party login only): verbatim match; no date on page | developer.apple.com/app-store/review/guidelines/ |
| 22 | 3.1.1(a): entitlements "are not required … in their United States storefront apps"; 3.1.3 exempts the US storefront | same |
| 23 | Uploads need Xcode 26+ / iOS 26 SDK since 2026-04-28; apps must target iOS 13+ since 2026-09-09 | developer.apple.com/news/upcoming-requirements/ |
| 24 | Play: new apps and updates must target API 36 from 2026-08-31; extension to 2026-11-01 on request | support.google.com/…/answer/11926878 |
| 25 | Play US: no ban on steering, and Play Billing not required. Policy effective 2025-10-29; programs launched 2025-12-09; fee reporting/payment from 2026-10-01 (external content links: 2026-12-01). Fee amounts are not on the page | support.google.com/…/answer/15582165 |
| 26 | Apple Developer Program $99/yr; organization work email "must be associated with your organization's domain" (also needs a public, functional org website) | developer.apple.com/programs/enroll/ |
| 27 | "On average, 90% of submissions are reviewed in less than 24 hours"; demo account required if features need sign-in | developer.apple.com/distribute/app-review/ |
| 28 | TestFlight: internal testers need no Beta App Review; external testers' first build does | developer.apple.com/help/app-store-connect/test-a-beta-version/ |
| 29 | Play 12 testers × 14 days applies to "personal developer accounts created after November 13, 2023"; the page is silent on organizations. Internal testing allows up to 100 testers | answer/14151465; answer/9845334 |
| 30 | AASA: "https with a valid certificate and with no redirects"; CDN fetches "within 24 hours"; devices check "approximately once per week"; each subdomain needs its own entry | Apple docs JSON |
| 31 | Android 15+: changes "can take up to seven days to propagate" (research paraphrased it in quote marks); `pm verify-app-links --re-verify` / `get-app-links`; page updated 2026-09-16 | developer.android.com/training/app-links/verify-android-applinks |
| 32 | TWA browser order (default → any TWA browser → Custom Tab); a failed DAL check shows a Custom Tab; page updated 2026-02-26 | developer.android.com TWA guide |
| 33 | Play webview policy quote ("without permission from the website owner or administrator") | answer/9899034 |
| 34 | Android 13+: notifications "off by default"; an app targeting 13+ "has complete control over when the permission dialog is displayed" | developer.android.com notification-permission |
| 35 | ITP "enabled by default in all WKWebView applications" (iOS 14, post 2020-06-26); up to 10 app-bound domains; ITP 2.1 caps `document.cookie` persistent cookies at 7 days | webkit.org/blog/10882, /8613 |
| 36 | Android WebView has no Push API (`webview_android: false`); iOS WebView also false | mdn/browser-compat-data PushManager.json |
| 37 | Capacitor #5478 (blob downloads, iOS + Android) open since 2022-03-02; no `DownloadListener` in Capacitor Android bridge classes | GitHub API, raw source |
| 38 | Ionic: new sales stopped 2025-02-11, access through 2027-12-31. "Ionic points to Capawesome": true, but the source is ionic.io's separate partnership post, not the Feb 2025 post | ionic.io/blog |
| 39 | Median: "Each license allows you to publish one app, which includes both an iOS and an Android version"; updated 2026-09-10 | docs.median.co/docs/licenses |
| 40 | Capgo native navigation 8.4.0 (published 2026-09-23), created 2026-05-10, 36 stars, MPL-2.0, README quote exact. Xcode Cloud 25 h incl., 100 h $49.99; Codemagic 500 free M2 min, $0.095/min; GitHub macOS $0.062, Linux $0.006 | GitHub API; vendor pricing pages |

## Unverified

- Median / MobiLoud / Natively prices (the research already marks these).
- Whether Apple/Epic linked-out purchases carry any commission **today** (secondary sources disagree).
- "Chrome 72+" for TWA: not on the cited guide page.
- `appStartPath` combined with a remote `server.url` (the source defines it for index.html paths; needs a device).
- "People report approved apps built this way" with `server.url`: anecdotal only (discussion #4080).
- "Plan for one 4.2 rejection round (3–5 days)" and Play new-app review time: estimates, no primary source.
- Organization accounts exempt from Play's 12/14 rule: Google's page is silent (the research says the same).
- State app-store age laws below: law-firm sources only; no primary statute or court text fetched.

## Omissions a launch decision should see

- **State App Store Accountability Acts.** Texas SB 2420 is **in effect**: the Fifth Circuit stayed the district
  court's injunction (2026-05-28 / 06-05). Developers must assign age ratings, read the store's age and parental-consent
  signals, and delete that data after use. Utah moved to 2027-05-06, Louisiana to 2027-07-01, Alabama 2027-01-01.
  Vibe is .edu-gated, but a Texas minor could still install it. The payments/legal research should decide whether
  store age signals are needed at launch. Sources: https://www.wiley.law/alert-Key-Developments-With-State-App-Store-Accountability-Acts-as-Texas-Act-Takes-Effect ;
  https://www.mofo.com/resources/insights/251111-texas-targets-app-stores-with-new-accountability-law
- **Apple's new age-rating questionnaire** has been required since 2026-01-31 (upcoming-requirements page). Every
  submission needs it, and a UGC + messaging app will not rate low.
- **Android developer verification**: apps must be registered by verified developers from 2026-09-30 (Brazil,
  Indonesia, Singapore, Thailand first; global in 2027). Play Console apps are mostly auto-registered. Low impact
  for a US Play-only launch, but the Play org verification step is real.
  Source: https://android-developers.googleblog.com/2026/06/android-developer-verification.html
- **Play Console $25 fee and Google's D-U-N-S lead time** (see correction 4). Start both accounts' D-U-N-S check on day 0.
