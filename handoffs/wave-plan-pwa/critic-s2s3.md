# Wave S2+S3 plan critic (2026-09-24)

Adversarial read of `plan.md` §5–§6 against the repo and against Capacitor 8.5.2 as published: the npm
tarballs of `@capacitor/cli|ios|android|core` 8.5.2, `app` 8.1.1, `browser` 8.0.4, `share` 8.0.2,
`filesystem` 8.1.3, `status-bar` 8.0.3, `splash-screen` 8.0.2, `assets` 3.0.5, `@capacitor-firebase/messaging`
8.5.2, and the CLI's own native templates (`ios-spm-template`, `android-template`), unpacked in a scratch folder.
Paths like `CAPBridgeViewController.swift:130` are in those packages; `src/…` paths are this repo. Read-only:
no server, browser, simulator or device. **Precedence: a RULING here overrides the plan line it names.**
Everything not named here stands as written.

**Plain English.** Two things stop the wave before it starts. The test file the orchestrator already wrote
fails the type check, and the type check is part of every Vercel deploy, so committing it as-is breaks the
live site's next deploy. And Capacitor 8.5's iPhone template now builds its screen in `SceneDelegate.swift`,
a file S3B doesn't own. Swipe-back would build cleanly and never ship.

The rest is Capacitor behaving differently from what the plan assumes:
- The "offline" page also appears when nothing is offline: on Android for every 404/500 page, on iPhone
  for an interrupted tap. Its "Try again" link leaves the app.
- The "opened from a link" URL comes back on every full page load, so a literal build loops forever.
- The phone's "Add to calendar" isn't the code S2D was given, and in the app it lands on the offline page.
- In Dark Mode the status bar is white text on cream, and saving a photo from the web view crashes the app.
- From inside the iPhone app the landing page, with its Google Play badge, is one "← back" away.

Four batches need a file they don't own. The dev-server setting can ship inside a release build, and the
Firebase plugin would add a very large download to every S3 build for code nothing calls yet.

---

1. **Orchestrator + S2A — blocking — `detect.test.ts` breaks `tsc` and therefore the Vercel build.**
   `src/lib/native/detect.test.ts:4` imports the literal `"./detect.ts"`. `npx tsc --noEmit -p .` (run
   2026-09-24) exits 2 with exactly one error: `TS5097: An import path can only end with a '.ts' extension
   when 'allowImportingTsExtensions' is enabled`. `next.config.ts` has no `typescript.ignoreBuildErrors`, and
   `tsconfig.json` includes `**/*.ts`, so `next build` type-checks test files too. Every S2 gate would also
   show this error. The house pattern exists because of this (`src/lib/pwa/display-mode.test.ts:10-24`:
   "tsc refuses a literal '.ts' specifier").
   **RULING:**
   - Before S2 starts, the orchestrator rewrites the import as
     `const specifier = "./detect.ts"; const { detectAppShell } = (await import(specifier)) as typeof import("./detect");`.
   - S2A: `display-mode.ts` imports `"../native/detect"` with no extension (tsc resolves it), and
     `display-mode.test.ts` gains the `module.registerHooks` resolve hook from
     `src/lib/iu/campus-request.test.ts:5-30`. Its header says "the module has no imports at all", which stops
     being true. Without the hook, `node --test` fails with `ERR_MODULE_NOT_FOUND`.
   - Gate: `npx tsc --noEmit -p .` exits 0 before S2 starts and after every S2 batch.

2. **S3B — blocking — the iPhone screen is created in `SceneDelegate.swift`, which S3B doesn't own.**
   Capacitor 8.5.2's SPM template is scene-based. `ios-spm-template/App/App/SceneDelegate.swift` does
   `window?.rootViewController = CAPBridgeViewController()` in code, and `Info.plist` routes the scene to it
   (`UISceneDelegateClassName`). Pointing the storyboard at `MainViewController` changes nothing, so
   swipe-back silently never ships and the xcodebuild gate still passes. `SceneDelegate.swift` falls under
   S3A's `mobile/**`. The template project is `objectVersion = 60` with classic groups (no synchronized
   folders), so a new `MainViewController.swift` isn't compiled until the project file lists it.
   **RULING:**
   - Move `mobile/ios/App/App/SceneDelegate.swift` to S3B. It sets `rootViewController = MainViewController()`
     and keeps all three `SceneDelegateProxy.shared…` forwarding lines.
   - Add `MainViewController.swift` to `project.pbxproj`: PBXFileReference, PBXBuildFile, a child of the App
     group, and the Sources phase, each with a fresh 24-hex id. The xcodebuild gate proves it compiled.
   - Set `webView?.allowsBackForwardNavigationGestures = true` in `override func capacitorDidLoad()`. Any
     `viewDidAppear` override calls `super`: `CAPSceneDelegateProxy` delivers cold-start links on
     `.capacitorViewDidAppear`.
   - Add no open-URL or `continue userActivity` hooks to `AppDelegate.swift`. A scene app never receives them;
     the template's SceneDelegate already forwards both. The storyboard edit is optional.

3. **S2B — major — `getLaunchUrl` keeps returning the same link; a literal build reloads forever.**
   - iOS `getLaunchUrl` returns `ApplicationDelegateProxy.shared.lastURL`, which is never cleared
     (`AppPlugin.swift:97-104`). Android returns the process's launch intent (`AppPlugin.java:91-100`).
   - NativeBridge mounts again on every full page load, and Vibe does many of those
     (`window.location.href = "/auth/login"`, `location.assign(ONBOARDING_PATH)`, …). Each mount runs
     `location.assign(launchUrl)` again: either a reload loop, or the student gets pulled back to that link
     after signing out.
   - On an iPhone cold start the same URL also arrives as a retained `appUrlOpen`
     (`retainUntilConsumed: true`, `AppPlugin.swift:55,63`, delivered after `capacitorViewDidAppear` by
     `CAPSceneDelegateProxy`). Two back-to-back `assign`s cancel the first navigation, which shows the error
     page (item 5).
   **RULING:**
   - One `openFromNative(url)`: `new URL(url)`, then require `protocol === "https:"` and host
     `www.connectvibe.app`. The target is `pathname + search + hash`. Skip it when it equals the current
     location, and when a module-level `pendingTarget` already holds it.
   - Call `getLaunchUrl()` once per app process, never on later page loads. Mark it with a sessionStorage
     key `vibe.launchUrlHandled`, wrapped in try/catch. `appUrlOpen` always calls `openFromNative`.
   - Treat a falsy `res?.url` as no URL. The iOS method resolves twice.
   - Native `addListener` stubs return `{ remove }` synchronously (`native-bridge.js:183-194`), while
     `@capacitor/core` returns a Promise. Do `const h = await Promise.resolve(ret)` and call `h.remove()` in
     the effect cleanup.

4. **S2B + S2D — major — a capture-phase click handler runs before everything and double-acts.**
   The root layout mounts first, so a `window` or `document` capture listener runs before React's handlers
   and before any later capture listener. Two consequences:
   - S2D's legal links: the plan has S2D call `openInBrowser` from its own `onClick`, and the generic handler
     would already have done `location.assign`. The student gets both an in-place navigation and the browser
     sheet.
   - `swallowNextClick` (`src/components/mobile/MessagesMobile.tsx:4519-4535`) eats the click after a
     long-press, in the capture phase; the generic handler would navigate first.

   In the App Router, React's root listeners are on `document` and were registered at hydration, so a
   bubble listener added later in an effect runs after them. `e.defaultPrevented` is then accurate.
   **RULING (overrides §6 "capture-phase"):**
   - `document.addEventListener("click", h)` in the bubble phase, attached only when
     `appShellOnClient() !== null`. Browsers get no listener at all.
   - `h` returns early on `e.defaultPrevented`, `e.button !== 0`, any modifier key, or no enclosing `a[href]`.
     It also returns when the protocol isn't `http:` or `https:`: check the protocol, not the origin, because
     a `blob:` URL reports the page's origin. `mailto:`, `tel:` and `sms:` stay untouched.
   - For a `target` other than empty or `_self`: same-origin → `preventDefault` + `location.assign`; any
     other origin → `openInBrowser`. `a[download]` is handled as in item 6.
   - S2D's call sites run `e.preventDefault()` before calling `openInBrowser`.

5. **S3A + S3C — major — the error page isn't only for offline, and relative links on it leave the app.**
   - iOS loads `errorPath` on every `didFail` and `didFailProvisionalNavigation`
     (`WebViewDelegationHandler.swift:139-162`, no error-code filter). That includes a cancelled navigation
     (−999: a tap superseded, swipe-back mid-load) and "Frame load interrupted" (an attachment response).
   - Android loads it on every main-frame HTTP status ≥ 400 (`BridgeWebViewClient.java:85-88`). A deleted
     post's 404 says "You're offline".
   - The page is served from `capacitor://localhost/offline.html` on iOS (`CAPInstanceConfiguration.swift:18-24`)
     and `https://localhost/offline.html` on Android (`Bridge.java:553-563`). So `location.reload()` and a
     relative `/campus` (what `public/offline.html:105-113` does) stay on localhost. On Android,
     `launchIntent` sends `https://localhost/campus` to Chrome (`Bridge.java:413-425`).

   **RULING:**
   - **S3A, `mobile/www/offline.html`:** the copy says "Vibe couldn't load this page" plus a connection hint,
     not a flat "You're offline". Try again and the `online` listener both do
     `location.replace("https://www.connectvibe.app/campus")`, an absolute URL. `mobile/www/index.html`
     redirects to the same URL.
   - **S3C, `MainActivity`:** after `super.onCreate`, `getBridge().setWebViewClient(...)` with a
     `BridgeWebViewClient` subclass. Its `onReceivedHttpError` notifies `bridge.getWebViewListeners()` but
     doesn't load `errorPath`, so Vibe's own 404/500 pages render (`Bridge.setWebViewClient`,
     `Bridge.java:1468`). Compiling it is DEFERRED.
   - **iOS:** `loadView` is `public final` and builds its own delegation handler, so it can't be subclassed.
     If the device pass shows the error page after a swipe-back or double-tap, wave 4 wraps
     `webView.navigationDelegate` in a proxy that ignores `NSURLErrorCancelled`.

6. **S2D (+ S2B) — major — the phone's "Add to calendar" isn't in `request.ts`.**
   - Phones render `EventCard` from `campus-home.tsx` (`src/components/mobile/CampusMobile.tsx:13,63`). Its
     "Add to calendar" is `<a href="/api/events/${ev.id}/ics" download>` (`src/app/campus/campus-home.tsx:8835`).
     The route answers `Content-Disposition: attachment` and needs the session
     (`src/app/api/events/[id]/ics/route.ts:22-24,77`).
   - In WKWebView that's a main-frame attachment, so it hits "Frame load interrupted" and the error page
     (item 5). Android has no `DownloadListener`, so nothing happens.
   - `downloadFile` (`src/lib/feedback/request.ts:234`) is only called by the desktop `LeftNav.tsx:1291`.
   - `Browser.open` can't help: its jar is Safari's, so the route answers 401.

   **RULING:**
   - `downloadFile(url, filename, opts)` keeps its signature. In the app it fetches with credentials, reads the
     blob as base64, calls `writeCacheFile`, then `nativeShare({ files: [uri] })`. On failure it shows the
     toast. In the app it never falls back to the blob anchor.
   - S2B's handler (item 4) sends a same-origin `a[download]` click in the app to `downloadFile(href, name)`.
     `name` is the `download` attribute, else `vibe-event.ics`: the only download anchors today are
     `campus-home.tsx:8835` and `LeftNav.tsx:1442`. `NativeBridge.tsx` may import `downloadFile`; there's no
     import cycle.

7. **S2A — major — from inside the app, the landing page is one "← back" away, Google Play badge included
   (Apple 2.3.10).**
   - "← back" goes to `/` on login (`src/app/auth/login/page.tsx:238`) and signup (`signup/page.tsx:270,345`).
     `LegalBackLink` also goes to `/` whenever the page isn't standalone, and the app never is.
   - `storeLinksFor` (`src/components/landing/home-landing.tsx:86-90`): once "ios-app" exists it matches
     neither `isIosPlatform` nor `android-`, so it falls to the desktop branch. That is **both** badges inside
     the iPhone app once the env vars are set; the server render (platform null) shows both anyway.
   **RULING:** give `src/app/page.tsx` (7 lines, already `force-dynamic`) to S2A:
   `if (await appShellFromRequest()) redirect("/campus")`. That one line covers every back link, and
   `home-landing.tsx` needs no edit. `/` is uncached today (`next.config.ts` max-age=0). Never add CDN
   caching to it without `Vary: User-Agent`.

8. **S2A (+ S3C) — major — the static pages' `_sw.js` registers the worker inside the Android app.**
   - `public/html/_sw.js:59` checks only the hostname.
   - The Android app gets the desktop tree whenever the viewport is ≥ 900 CSS px: landscape phones, tablets,
     foldables. Android 16 ignores orientation locks on large screens for target 36. The desktop messages
     and onboarding shells iframe `/html/*.html` (`next.config.ts`), and each of those loads `_sw.js`.
   **RULING:**
   - Add `public/html/_sw.js` to S2A. After the kill branch: if
     `/VibeApp\/\d+\s*\((ios|android)\)/.test(navigator.userAgent)` or `window.Capacitor?.isNativePlatform?.()`,
     unregister every registration and return.
   - In the React registrar, the in-app branch runs `unregisterAll(container)` and then returns, like the
     wrong-host branch (`src/components/pwa/ServiceWorkerRegistrar.tsx:52-58`). A bare return would leave a
     worker from an earlier build in place. The kill branch stays first.
   - S3C sets `android:screenOrientation="portrait"` on `MainActivity`.

9. **S2D — major — the code-first copy keys on `standalone`, which is false in the app; one of the two pages
   isn't S2D's.** `signup/page.tsx:128-130,282-294` and `src/app/auth/school-email/page.tsx:172-174,521,570,644`
   give the app the browser copy: "Tap Confirm in that email — any browser or phone works". In v1 there are
   no Universal Links until S3D and the paid team exist. The link opens Safari or Chrome and signs *that*
   browser in, not the app.
   **RULING (overrides §6 S2D "never shows in the app"):**
   - Add `src/app/auth/school-email/page.tsx` to S2D.
   - In both pages: `const inApp = useAppShell() !== null; const codeFirst = standalone || inApp;`, and
     `codeFirst` replaces every `standalone ?` branch.
   - The line "Links in the email open in your browser, not this app." shows when
     `(standalone && isIosPlatform(platform)) || inApp`. It stays true in the app until S3D's links are
     verified on devices; S3D removes the `inApp` half then. Never "tap the link on this phone" in v1.

10. **S3B — major — `Info.plist` gaps: a crash, an invisible status bar, landscape.**
    - **Crash.** WKWebView's long-press on an image offers "Save to Photos", and the share sheet for an image
      offers "Save Image". Without `NSPhotoLibraryAddUsageDescription`, iOS terminates the app. Vibe is
      photo-first, so a reviewer long-pressing a post photo is a 2.1 crash rejection.
    - **Status bar.** In Dark Mode the default status bar style is white text, which disappears on cream.
    - **Landscape.** The template allows it (`UISupportedInterfaceOrientations` lists Landscape Left and Right),
      and `TARGETED_DEVICE_FAMILY = "1,2"` is set in both configurations (template `project.pbxproj:316,337`).
    **RULING:**
    - Add `NSPhotoLibraryAddUsageDescription` in Vibe's plain voice, next to the camera, photos and
      microphone keys.
    - Add `UIUserInterfaceStyle` = `Light` (no page uses `prefers-color-scheme`).
    - Orientations: Portrait only, and delete the landscape entries.
    - `TARGETED_DEVICE_FAMILY = 1` in both configurations.

11. **S3B — major — the privacy manifest: the plan's API list isn't what 8.5.2 uses, and the file has to be in
    the build.**
    - Capacitor's own `PrivacyInfo.xcprivacy` declares no accessed APIs (empty arrays), and core never uses
      `UserDefaults`.
    - The one required-reason API in this plugin set is file timestamps: `@capacitor/filesystem`'s stat reads
      ctime and mtime (`IONFileStructures+Converters.swift:45-46`).
    - A file sitting in the folder isn't bundled. Upload rejects undeclared required-reason APIs (ITMS-91053).
    **RULING:**
    - Declare `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1`. `NSPrivacyTracking` false,
      no tracking domains.
    - `NSPrivacyCollectedDataTypes` lists what Vibe collects, from repo-readiness §c; S4 cross-checks it against
      the App Privacy label.
    - Add the file to `project.pbxproj`: PBXFileReference, PBXBuildFile, and the **Resources** phase.
    - Gate after the build: `App.app/PrivacyInfo.xcprivacy` exists in the Debug-iphonesimulator product.
    - Add `UserDefaults` `CA92.1` only when Firebase is linked (item 12).

12. **S3A — major — don't install `@capacitor-firebase/messaging` in this wave.**
    - `cap sync` adds it to `CapApp-SPM`, which pulls `firebase-ios-sdk`
      (`.upToNextMajor(from: "12.7.0")`, the plugin's `Package.swift`).
    - That means a very large clone, then FirebaseCore, Messaging, Installations, GoogleUtilities and nanopb
      compiled from source on every xcodebuild gate. It's the over-2-minute stall the house rules warn about,
      for a plugin nothing calls.
    - It also puts an unused Google SDK and its data declarations into the first reviewed binary.
    - Without `GoogleService-Info.plist` it does nothing anyway (`FirebaseMessaging.swift:16-22` returns early).
    **RULING:**
    - Install it in wave 2′, with the wiring.
    - `@capacitor/haptics` is harmless but nothing in S2 calls it, so S1E's review notes must not list haptics
      until something does.
    - Its Android manifest adds `POST_NOTIFICATIONS`; S3C declares that itself.

13. **S3A — major — `capacitor.config.ts` and `mobile/package.json` values the plan leaves open or gets wrong.**
    - **User agent.** Both platforms insert the separating space themselves: iOS
      `"\(appName) \(appendUserAgent)"` (`CAPBridgeViewController.swift:130-135`), Android
      `defaultUserAgent + " " + append` (`Bridge.java:598-601`). Use `"VibeApp/1 (ios)"` and
      `"VibeApp/1 (android)"` with no leading space. The `detect.ts` comment "Capacitor 8 stopped padding" is
      wrong for 8.5.2; the regex copes either way.
    - **Background.** Top-level `backgroundColor: "#FAF7F2"`, so the web view isn't white before the first
      paint (critic.md §4.7).
    - **Server URL.** `server.url` exactly `"https://www.connectvibe.app"`, with no trailing slash. Android
      concatenates `appUrl += appStartPath` (`Bridge.java:651-653`), so a trailing slash gives `//campus`.
    - **Splash.** `SplashScreen.launchAutoHide: true` (the default), never `false`. The Android error page gets
      no plugins (the `errorPath` doc comment in `declarations.d.ts`), so a JS `hide()` never runs offline and
      the app would stay on the splash. Set about 1500 ms and a cream `backgroundColor`.
    - **Status bar.** `plugins.StatusBar.style: "LIGHT"` and `plugins.SystemBars.style: "LIGHT"`. `"LIGHT"`
      means dark text for light backgrounds (`core-plugins.d.ts` SystemBarsStyle; StatusBar's `Style.Light`).
      NativeBridge passes the same string literal. `StatusBar.setBackgroundColor` is "Not available on
      Android 15+", so nothing may depend on it.
    - **Leave off.** `CapacitorHttp` and `CapacitorCookies` stay off (their default); on, they would patch
      `fetch` and `document.cookie` for the whole site.
    - **No signing values.** Never put `android.buildOptions.keystore*` or `ios.buildOptions` signing values
      in this committed file.
    - **`mobile/package.json`.**
      - `typescript` as a devDependency: the CLI refuses a `.ts` config without it (`config.js:84-87`). Today
        it only resolves by walking up to the root's copy.
      - Exact versions, no `^`, and commit `package-lock.json`.
      - No `"type": "module"`.

14. **S3A — major — the dev URL can ship inside a release build.**
    - The config is evaluated at `cap sync` time and written into generated, gitignored copies:
      `ios/App/App/capacitor.config.json` and `android/app/src/main/assets/capacitor.config.json`.
      `cleartext: true` also writes `android:usesCleartextTraffic="true"` into
      `capacitor-cordova-android-plugins`' manifest (CLI `cordova.js:756-763`).
    - A sync with `CAP_DEV_URL` set, followed by an Archive, ships the LAN URL with cleartext allowed.
    **RULING:**
    - Add `mobile/scripts/check-release-config.mjs` as npm script `release:check`. It fails unless both
      generated configs have `server.url === "https://www.connectvibe.app"` and no `cleartext`, or if
      `project.pbxproj` contains a `DEVELOPMENT_TEAM` value (item 15).
    - README: before every Archive or bundle, run `npx cap sync` without `CAP_DEV_URL`, then
      `npm run release:check`.
    - The dev flow that works: `CAP_DEV_URL=http://localhost:3000` on the iOS Simulator. It shares the Mac's
      network, so local Supabase at `127.0.0.1:54321` resolves.
    - An Android emulator or phone needs the LAN IP for both the page and `NEXT_PUBLIC_SUPABASE_URL`, plus
      Next 16's `allowedDevOrigins` (`next.config.ts`, not owned). DEFERRED. iOS ATS rules for a LAN IP are
      UNVERIFIED.
    - The README also says that in a dev build, the error page's Try again opens the real site in
      Safari or Chrome.

15. **S3A — major — secrets hygiene beyond the listed patterns.**
    - Xcode writes `DEVELOPMENT_TEAM = <Team ID>;` into `project.pbxproj` as soon as anyone picks a team.
    - `.build-logs/` holds xcodebuild output, including absolute paths and environment.
    - Play and FCM service-account keys aren't named `google-services.json`.
    **RULING:**
    - `.gitignore` also gets `mobile/.build-logs/`, `*.local.xcconfig`, `*service-account*.json`,
      `*firebase-adminsdk*.json` and `*.pfx`.
    - The README says: pick the team in Xcode, never commit that hunk; `release:check` catches it.
    - Gate right after writing `.gitignore`: `git check-ignore -v` prints a rule for each of
      `mobile/android/app/google-services.json`, `mobile/ios/App/App/GoogleService-Info.plist`,
      `mobile/android/keystore.properties`, `a.jks`, `AuthKey_X.p8`, `mobile/.build-logs/x.log` and
      `mobile/node_modules/x`.
    - No tracked file matches these patterns today (`git ls-files` checked).
    - Pre-note for S3D: the Team ID is public by design in `apple-app-site-association`. Restate the house
      rule then as "Team ID only in that one file".

16. **S3A + S3C — major — placeholder art, the icon's alpha channel, and who owns `res/`.**
    - The templates ship Capacitor's own icon and splash art: iOS `AppIcon-512@2x.png` and
      `splash-2732x2732*.png`; Android `mipmap-*/ic_launcher*` and `drawable*/splash.png`. A Capacitor logo at
      launch is a placeholder rejection.
    - An alpha channel in the 1024 px icon fails upload.
    - `@capacitor/assets` 3.0.5 depends on `sharp` 0.32.6 (a native install on Node 25) and on a nested
      `@capacitor/cli` `^5.3.0`.
    - The generated Android icons land in `res/**`, which the plan gives to S3C.
    **RULING:**
    - Install `@capacitor/assets` in its own `npm i -D` step, so a failed sharp build can't sink the core
      install. If it fails, a `mobile/scripts/` sharp script using the root's `sharp` 0.35.4 does the same job.
    - Gates:
      - `sips -g hasAlpha …/AppIcon.appiconset/AppIcon-512@2x.png` prints `hasAlpha: no`.
      - No iOS icon or splash file, and no Android mipmap or splash file, has the same `shasum` as the
        template's copy.
    - Ownership is sequential: S3A writes the launcher and splash files before S3C starts. S3C then owns
      `res/**` but never regenerates or deletes them.

17. **S2A + S2C — minor — how the app-mode hook behaves on first paint.**
    - `useAppShell` uses `useSyncExternalStore`, the way `src/lib/pwa/use-standalone.ts` does. Components
      mounted later then read the real value at once; only the hydrating page has one `null` frame.
    - `/plus` decides on the server with `appShellFromRequest()`. The client teasers (`OttoMetrics.tsx:99`,
      `PostAudienceList.tsx:88`) hide on `useAppShell() !== null` and accept that one hydration frame.
    - `failure-copy.ts` keeps its exported signatures, because `request.ts` (S2D) imports it. It reads app mode
      inside with `appShellOnClient()`, which is `null` on the server.
    - Consumers that need "in the app" use `useAppShell()`, never `usePlatform()`.

18. **S2B — minor — the bridge must be safe to render on the server and must never throw.**
    - `bridge.ts`, `NativeBridge.tsx` and `use-app-shell.ts` are imported by the root layout, which is
      server-rendered for every page. None of them touches `window` or `document` at module scope.
      `NativeBridge` renders `null` and does all its work in `useEffect`, after `appShellOnClient()`.
    - Never read `headers()` in `layout.tsx`: it makes every route dynamic.
    - Every native call ends in `.catch` (the house rule in `ServiceWorkerRegistrar.tsx:34-38`).
    - `nativeShare` resolves `true` once the sheet has opened, including when the student cancels. Share
      rejects with "Share canceled" (`SharePlugin.swift:63`, `SharePlugin.java:79`). Callers fall back only
      on `false`.
    - `writeCacheFile` sends `{ path, data, directory: "CACHE" }` with no `encoding`, which means base64. It
      uses string literals, since there's no enum import.
    - `openInBrowser` sends only `http:` and `https:` URLs to `Browser.open` (`Browser.swift:19` ignores
      other schemes).
    - `App.exitApp` runs on Android only; on iOS it's `call.unimplemented()`.
    - Optional: before `history.back()`, dispatch a cancelable `vibe:native-back` event, so a sheet can close
      itself first.

19. **S3B — minor — the entitlements file doesn't break the gate, but it would break a free-team phone
    build.** With `CODE_SIGNING_ALLOWED=NO` the entitlements aren't used, so the gate passes. A device build
    under a free Personal Team, Franky's only option before enrollment, can't provision Push or Associated
    Domains.
    **RULING:**
    - Set `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` in the **Release** configuration only. Debug gets
      it when the paid team exists (S3D or wave 2′). No PBXFileReference is needed for it.
    - For a later simulator run, use `CODE_SIGN_IDENTITY=-` (ad-hoc) rather than signing off.

20. **S3A + S3B — minor — running the gate on this Mac.**
    - No iOS Simulator runtime is installed (`xcrun simctl list runtimes` is empty). The `iphonesimulator26.4`
      SDK is present, which is all a build needs. Running the app needs a runtime download of several GB
      (Xcode ▸ Settings ▸ Components): Franky's call, DEFERRED.
    - Running `simctl` here printed "Install Started … Install Succeeded" (CoreSimulator updating its own
      service). Agents: don't run `simctl`.
    - Gate command: add `-destination 'generic/platform=iOS Simulator'`, and run it in the background into
      `mobile/.build-logs/`. The first run downloads `capacitor-swift-pm`'s binary frameworks.
    - Run `npx cap` from `mobile/` in the same command (`cd /Users/franciscocazares/vibe/mobile && npx cap
      sync`), since the shell's working directory resets between calls.
    - Confirmed: SPM is the CLI default (`index.js` `getPackageManager` → `'SPM'`), and CocoaPods is only on
      the pod path. `cap add` and `sync` for Android run no Gradle, so they work without the SDK. The CLI
      doesn't prompt when it isn't in an interactive terminal.

21. **S3C — minor — Android details to hold.**
    - Keep the template's `FileProvider` (`${applicationId}.fileprovider`, `@xml/file_paths` with
      `<cache-path>`): sharing a Filesystem CACHE file depends on it.
    - The `google-services` plugin is applied only when the file exists; the template's `try` block already
      does this, so keep it.
    - App Links: host `www.connectvibe.app`, `https` only, `pathPrefix` entries only, never `/`. `autoVerify`
      fails harmlessly until S3D publishes `assetlinks.json`.
    - No `signingConfig` in this wave. When it comes, it reads the ignored `keystore.properties`.
    - `android:screenOrientation="portrait"` (item 8).
    - Channel ids exactly `messages` and `activity`: wave 2′'s `toFcm()` uses them (critic.md §6, 2D).
    - All Java is uncompiled here: DEFERRED.

22. **S2C — minor — the manage-subscription portal opens in Safari.** That's fine in the US storefront:
    3.1.1(a) and 3.1.3 exempt US-storefront apps (wrapper-tech.factcheck #22). Other storefronts don't get that
    exemption.
    **RULING:**
    - Keep the portal for comp and active members.
    - Checkout's `store_app` 403 runs before auth and before Stripe.
    - S4 limits App Store availability to the United States.

---

**Confirmed (no change needed).**
- `window.Capacitor.Plugins.<Name>` exists on the remote page with no npm import. Native code injects a stub
  per registered plugin at document start: iOS `JSExport.swift` `exportJS`, for all main frames; Android
  `JSExport.java` `getPluginJS` via `addDocumentStartJavaScript`, for the server URL's origin only
  (`Bridge.java:266-270`). So §6 S2B's approach works.
- The bridge clears listeners on every navigation start (iOS `didStartProvisionalNavigation` → `reset()`,
  Android `onPageStarted` → `reset()`), so NativeBridge re-registering on each load is correct.
- `appStartPath` exists (since 7.3.0) and joins cleanly on iOS.
- `contentInset "never"` is already the iOS default.
- Android's Share plugin, Browser plugin and App `backButton` `{canGoBack}` shapes are as §6 assumes.

**DEFERRED (nobody may claim these):**
- Every simulator, emulator and device run, and all Android builds.
- Cold and warm link opens once S3D exists.
- iOS swipe-back mid-load and a double-tapped link.
- Android back on a full-page-load boundary.
- The Share sheet offering Calendar for `.ics`.
- Status bar legibility in Dark Mode.
- The keyboard with the Messages composer.
- Cookie persistence across a force-quit.
- The Android 404 page after the S3C client swap.
- Offline cold start on both platforms.
