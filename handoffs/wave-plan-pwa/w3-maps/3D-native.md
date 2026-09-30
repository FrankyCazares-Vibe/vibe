# 3D map: the iOS and Android shells for native push (wave 3′)

Read-only map, 2026-09-25, repo at 55351a9. Nothing was built, synced or installed.

**Where the citations point**
- `CI/` = `mobile/node_modules/@capacitor/ios/Capacitor/Capacitor/`. `CA/` = `mobile/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/`. Both are version 8.5.2.
- `FM/` is the plugin source. It is **not** in `mobile/node_modules` (see §0). It was read from the npm tarball `@capacitor-firebase/messaging@8.5.2` that the S2/S3 critic unpacked earlier: `/private/tmp/claude-501/-Users-franciscocazares-vibe/676f7179-01d8-4307-8b24-be0304bc4728/scratchpad/cap/capacitor-firebase-messaging-8.5.2/package/` (tgz sha256 `706219d3…4ad`). After `npm install` the same files are at `mobile/node_modules/@capacitor-firebase/messaging/`.

## 0. Headline: the plugin is NOT installed
- `mobile/package.json:15-31` has no `@capacitor-firebase/messaging`. `mobile/node_modules/@capacitor-firebase/` doesn't exist, and `package-lock.json` has no firebase entry.
- This was on purpose. critic-s2s3.md item 12 (lines 218-229): "Install it in wave 2′, with the wiring." mobile/README.md:159-160 says the same, and AppDelegate.swift:7-8 says "The push wave adds its registration hooks here".
- It is also missing from every generated list: `ios/App/CapApp-SPM/Package.swift:13-38`, `android/capacitor.settings.gradle:1-27`, `android/app/capacitor.build.gradle:11-19`, the synced `ios/App/App/capacitor.config.json` `packageClassList`, and `android/app/src/main/assets/capacitor.plugins.json`.
- So wave 3′ has to:
  1. Run `npm install --save-exact @capacitor-firebase/messaging@8.5.2` in `mobile/`. The `firebase` JS peer is optional (`FM/package.json`, `peerDependenciesMeta.firebase.optional`); skip it.
  2. Run `npx cap sync`. That rewrites the four generated files above plus `Package.resolved`, and all of them get committed.

## 1. Package versions and Capacitor config
- **Pinned versions** (`mobile/package.json:15-31`):
  - `@capacitor/android`, `core`, `ios` and `cli`: 8.5.2.
  - `app` 8.1.1, `browser` 8.0.4, `filesystem` 8.1.3, `haptics` 8.0.2, `keyboard` 8.0.5, `share` 8.0.2, `splash-screen` 8.0.2, `status-bar` 8.0.3.
  - Dev only: `@capacitor/assets` 3.0.5, `typescript` 5.9.3.
- **Plugin 8.5.2 compatibility:**
  - Peer `@capacitor/core >=8.0.0` is met.
  - iOS 15 minimum (`FM/Package.swift:6`) matches the project's `IPHONEOS_DEPLOYMENT_TARGET = 15.0` (pbxproj:315, 338).
  - Android defaults are minSdk 24 and compile/target 36 (`FM/android/build.gradle:23-26`), which match `variables.gradle:2-4`.
- **`capacitor.config.ts:78-97` plugins today:** CapacitorHttp off, CapacitorCookies off, SplashScreen, StatusBar, SystemBars. There is **no `FirebaseMessaging` block.**
  - So on iOS, `presentationOptions` falls back to the default `["badge","sound","alert"]` (`FM/ios/Plugin/FirebaseMessagingConfig.swift:2`). The plugin reads it from `plugins.FirebaseMessaging.presentationOptions` (FirebaseMessagingPlugin.swift:264-272).
  - Allowed values are `badge`, `sound`, `alert` and `criticalAlert` (FM/README.md:168-177). `criticalAlert` only changes the permission request (FirebaseMessaging.swift:37-39); `willPresent` ignores it (155-166). Android ignores the whole setting.
- **No `experimental` block.** The README asks for `experimental.ios.spm.packageOptions["@capacitor-firebase/messaging"] = { symlink: true }` to avoid an SPM package-identity collision (FM/README.md:96-116).
  - It needs CLI 8.4.0 or later. We have 8.5.2, and it's implemented at `node_modules/@capacitor/cli/dist/util/spm.js:92, 124-133`.
  - It makes sync create an **absolute** symlink at `ios/App/CapApp-SPM/symlinks/CapacitorFirebaseMessaging` (the name comes from `cli dist/plugin.js:76-83` `fixName`). `CapApp-SPM/.gitignore:1-9` doesn't ignore that path.
  - Sync deletes `symlinks/` before rebuilding it (`cli dist/ios/update.js:592-597`).
- **Relevant points from `mobile/README.md`:**
  - The repo is public: never commit `google-services.json` or `GoogleService-Info.plist` (15-26).
  - iOS uses SPM, with no CocoaPods (37).
  - The `xcodebuild` gate needs the iOS 26.4 platform, which this Mac didn't have on 2026-09-24, so it has never passed (65-78).
  - Android Studio and the Android SDK aren't installed (85-88).
  - The site reaches plugins through `window.Capacitor.Plugins`, with no `@capacitor/*` imports (157-159).
  - Run `release:check` before any Archive (111-119).

## 2. The iOS shell today
- **AppDelegate.swift** (49 lines, read in full):
  - `@UIApplicationMain`, an empty `didFinishLaunching` (14-17), lifecycle stubs (19-39), and `configurationForConnecting` returning SceneDelegate (41-48).
  - No push hooks and no Firebase import. The comment at 4-8 says the app is scene-based and warns not to add open-URL handlers here.
- **SceneDelegate.swift:7-21** creates the `UIWindow`, sets `rootViewController = MainViewController()` and calls `makeKeyAndVisible()` (13-15). Only then does it call `SceneDelegateProxy.shared.scene(…willConnectTo…)` (20).
  - `makeKeyAndVisible` loads the view, so `CAPBridgeViewController.loadView` (CI/CAPBridgeViewController.swift:30-53) creates the bridge there.
  - `CapacitorBridge.init` (CI/CapacitorBridge.swift:204-224) does two things:
    - It sets `UNUserNotificationCenter.current().delegate` to the bridge's `notificationRouter` (210-211, CI/NotificationRouter.swift:4-17). This is on by default (CI/CAPInstanceDescriptor.m:42).
    - It runs `registerPlugins()`, which calls each plugin's `load()` (CapacitorBridge.swift:368-383, CI/CAPPlugin+LoadInstance.swift:18).
  - **Result:** the notification delegate and the Firebase plugin's `load()` both run at scene connect, AFTER `didFinishLaunching`.
- **SceneDelegateProxy** (CI/CAPSceneDelegateProxy.swift:17-35) replays `connectionOptions.urlContexts` and `userActivities` on the first `capacitorViewDidAppear`. It ignores `connectionOptions.notificationResponse`.
- **MainViewController.swift:9-24:** `capacitorDidLoad` turns on swipe-back and registers `SameSiteNavigationPlugin` (43-76), which only overrides `shouldOverrideLoad`. Nothing here is about push, and push needs no change here.
- **Info.plist (92 lines)** has none of these keys:
  - `UIBackgroundModes`.
  - `FirebaseAppDelegateProxyEnabled`, so Firebase's swizzling is ON once Firebase is configured.
  - `FirebaseMessagingAutoInitEnabled`.
- **App.entitlements:19-24:** `aps-environment` = `development`, plus associated-domains `applinks:www.connectvibe.app`. The comment at 7-13 says only Release uses the file, and Xcode switches to `production` when it exports for the App Store.
- **project.pbxproj:**
  - `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` is set ONLY in the target's Release config (line 334, block 330-350). The target's Debug config (307-328) has none, so a Debug build has no `aps-environment` and **APNs registration fails in Debug**.
  - File reference at line 37, group at 81. No `DEVELOPMENT_TEAM` (README 121-131 keeps it out).
  - Build phases (94-99): Sources, Frameworks and Resources only; there is no Run Script.
  - The Resources phase (149-162) lists LaunchScreen, public, Assets, capacitor.config.json, Main, config.xml and PrivacyInfo. **`GoogleService-Info.plist` isn't referenced anywhere in the file** (grep).
  - `ENABLE_USER_SCRIPT_SANDBOXING` isn't set. `LastUpgradeCheck = 0920` (118).
- **SPM setup:**
  - `CapApp-SPM/Package.swift:13-38` says "DO NOT MODIFY" (the CLI manages it). It lists `capacitor-swift-pm` exact 8.5.2 plus the 8 local plugin packages.
  - The App target links the `CapApp-SPM` product (pbxproj:11, 45, 105, 376-387).
  - The committed `Package.resolved` pins only `capacitor-swift-pm` 8.5.2 and `ion-ios-filesystem` 1.1.4.
- **What sync will add for the plugin:** `.package(name: "CapacitorFirebaseMessaging", path: …)`.
  - That package pulls `firebase-ios-sdk` `.upToNextMajor(from: "12.7.0")` (FM/Package.swift:14) for the products FirebaseCore and FirebaseMessaging (22-23). The Swift source also imports FirebaseInstallations (FirebaseMessagingPlugin.swift:5).
  - The first resolve takes the newest 12.x and then pins it in `Package.resolved`. The CocoaPods spec equivalent is `~> 12.7` (podspec:16).
  - The Firebase SDK isn't on this Mac: `DerivedData/SourcePackages/checkouts` holds only `capacitor-swift-pm` and `ion-ios-filesystem`. The first resolve is therefore a large clone (critic-s2s3.md:219-222).
- **Privacy manifest:** PrivacyInfo.xcprivacy:15-16 says "When Firebase is linked … check its manifests before adding UserDefaults CA92.1 here."
- **Gitignore:**
  - Root `.gitignore:87-88` ignores `google-services.json` and `GoogleService-Info.plist` at any path. `git check-ignore` confirmed both target paths.
  - Root `.gitignore:91` ignores `*firebase-adminsdk*.json`.

## 3. The plugin's iOS source (8.5.2)
- **`load()`** (FirebaseMessagingPlugin.swift:43-47):
  - Always constructs `FirebaseMessaging(plugin:config:)`.
  - Observes `.capacitorDidRegisterForRemoteNotifications` and a raw `"didReceiveRemoteNotification"` notification.
  - Does **not** observe `.capacitorDidFailToRegisterForRemoteNotifications`.
- **`FirebaseMessaging.init`** (FirebaseMessaging.swift:12-26), in order:
  1. `if FirebaseApp.app() == nil { guard FirebaseOptions.defaultOptions() != nil else { CAPLog.print("…GoogleService-Info.plist is missing…"); return }; FirebaseApp.configure() }`
  2. `UIApplication.shared.registerForRemoteNotifications()`
  3. `Messaging.messaging().delegate = self`
  4. `plugin.bridge?.notificationRouter.pushNotificationHandler = self`
- **What that means:**
  - The plugin configures Firebase itself, behind a guard. A missing plist gives a log line and an early return: no APNs registration, no Messaging delegate, no push handler. **It doesn't crash.**
  - When Firebase is configured, the plugin calls `registerForRemoteNotifications` on EVERY launch. That's APNs registration only; it doesn't show a permission prompt.
- **Calls that are refused when Firebase isn't configured:**
  - `isFirebaseConfigured` means `FirebaseApp.app() != nil` (FirebaseMessaging.swift:28-30; the plugin's copy is at 256-258).
  - `getToken`, `deleteToken`, `subscribeToTopic` and `unsubscribeFromTopic` reject with `call.unavailable("Firebase is not configured: GoogleService-Info.plist is missing from the app bundle.")` (78-82, 96-100, 147-151, 168-172; the message is at 38; the helper is at 260-262).
  - In JS that arrives as error code **`"UNAVAILABLE"`** (CI/CAPPluginCall.swift:61-62).
  - `setApnsToken` and `handleRemoteNotificationReceived` return early too (FirebaseMessaging.swift:119-134).
  - `checkPermissions`, `requestPermissions`, `isSupported` and the delivered-notification methods keep working, because they only use UNUserNotificationCenter.
- **The unguarded `Messaging.messaging()` calls** (FirebaseMessaging.swift:65-66, 138, 144) can only be reached through `getToken` (guarded) or the push handler (only set when Firebase is configured). **So there is no crash path without the plist, as long as nothing calls `FirebaseApp.configure()` without a guard.**
  - An unguarded `FirebaseApp.configure()` with no plist raises an NSException ("could not find a valid GoogleService-Info.plist"). That is the Firebase SDK's own `+configure` behaviour; the SDK isn't on disk, so there's no line to cite.
  - **So AppDelegate must not call it.** The plugin already does, guarded.
- **AppDelegate code the README requires** (FM/README.md:128-140, quoted verbatim):
  ```swift
  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
  }
  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
  }
  func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable : Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
      NotificationCenter.default.post(name: Notification.Name.init("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
  }
  ```
  - The notification names are public in Capacitor (CI/CAPNotifications.swift:12-15), so no Firebase import is needed.
  - The README doesn't call `FirebaseApp.configure()` in AppDelegate, and it warns against installing any other push plugin at the same time (README 120). Vibe has none.

- **Permissions:**
  - `requestPermissions` asks for alert, badge and sound (FirebaseMessaging.swift:32-43) and resolves `{receive: "granted"|"denied"}` (plugin 61-70).
  - `checkPermissions` maps authorized, ephemeral and provisional to `granted`, denied to `denied`, and notDetermined to `prompt` (45-62).
- **`getToken`** sets `isAutoInitEnabled = true`, then calls `Messaging.messaging().token` (64-73).
  - FCM needs the APNs token first. It arrives through the AppDelegate hook and `setApnsToken` (plugin 241-250; FirebaseMessaging.swift:119-124).
  - Firebase's swizzling (on by default) also sets it by itself.
- **Events.** All are sent with `retainUntilConsumed: true`:
  - `tokenReceived` `{token}` (201-208), from the MessagingDelegate (175-177).
  - `notificationReceived` `{notification}` (210-222), from `willPresent` (151-152, foreground) and from the `didReceiveRemoteNotification` path.
  - `notificationActionPerformed` `{actionId: "tap"|"dismiss"|<id>, notification, inputValue?}` (224-239), from `didReceive` (171-173).
  - `apnsTokenReceived` `{token: HEX}` (241-250).
- **Payload shape:** `notification = {body, data, id, subtitle, title}`, where `data` is the whole `userInfo` converted to JS (FirebaseMessagingHelper.swift:6-14).
  - FCM puts custom data keys at the top level of `userInfo`. So Vibe's `data: {url, tag, kind}` (src/lib/push/payload.ts:498-503) arrives as **`event.notification.data.url`**, alongside `aps`, `gcm.message_id` and `google.c.*`.
  - The `didReceiveRemoteNotification` path gives only `{data}`, with no id or title (Helper 16-20).
- **Foreground display:** `willPresent` returns the configured `presentationOptions` (151-169). `alert` means a banner.

## 4. Keeping the iOS app from crashing without GoogleService-Info.plist
- **No extra native guard is needed.** The plugin's own check (FirebaseMessaging.swift:16-21) is the guard. The rule for the AppDelegate: no `import FirebaseCore` and no `FirebaseApp.configure()`.
- If the planner still wants AppDelegate to configure Firebase earlier:
  - Use `if FirebaseOptions.defaultOptions() != nil { FirebaseApp.configure() }`, or the `Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil` check.
  - The App target only links `CapApp-SPM`, so importing FirebaseCore there relies on transitive module visibility, which is untested. **Not recommended.**
- **The real gap is getting the plist into the app bundle.** It's gitignored, and the pbxproj doesn't reference it. Options:
  - **a) Resources phase**, like PrivacyInfo (pbxproj:20, 36, 80, 159). A clone without the file fails the build ("Build input file cannot be found"), which breaks the gate for everyone without the file. **No.**
  - **b) A Run Script phase after Resources** (snippet in the diff at the end). It copies `${SRCROOT}/App/GoogleService-Info.plist` (that is, `mobile/ios/App/App/`) into `${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/` when the file exists, and prints an Xcode warning otherwise.
    - The target needs `ENABLE_USER_SCRIPT_SANDBOXING = NO` set explicitly (it's unset today) and `alwaysOutOfDate = 1`.
    - Also extend `mobile/scripts/check-release-config.mjs` to fail when `ios/App/App/GoogleService-Info.plist` or `android/app/google-services.json` is missing.
    - **Recommended.**
  - **c) FirebaseOptions from a gitignored `*.local.xcconfig`** (README:22 already ignores that pattern), passed through Info.plist to `FirebaseApp.configure(options:)` in AppDelegate. The plugin would then see `FirebaseApp.app() != nil` and carry on (FirebaseMessaging.swift:16). It needs the FirebaseCore import; more moving parts.
- The plist must be for bundle id `app.connectvibe.vibe` (pbxproj:322, 344).
- **What the page sees without the plist:** the plugin is present and permissions work, but `getToken` rejects with code `UNAVAILABLE`. The page reads that as "push isn't available in this build".

## 5. The Android shell
- **Gradle:**
  - `app/build.gradle:48` applies `capacitor.build.gradle`. Lines 54-61 apply `com.google.gms.google-services` only when `app/google-services.json` exists; a missing file is caught and only logged.
  - Root `build.gradle` has classpath `com.google.gms:google-services:4.4.4` (11) and AGP 8.13.0 (10). There's no `signingConfig` (app/build.gradle:19-21).
- **google-services.json** goes at `mobile/android/app/google-services.json` (app/build.gradle:55; the path is relative to the app module). It's gitignored (.gitignore:87).
  - Its client must be for package `app.connectvibe.vibe` (app/build.gradle:4, 7), or the google-services plugin fails the build.
- **Generated plugin lists:** `capacitor.settings.gradle:1-27` and `app/capacitor.build.gradle:11-19` are generated and committed ("DO NOT EDIT"). They list 8 plugins and no Firebase.
  - Sync adds `:capacitor-firebase-messaging`, pointing at `../node_modules/@capacitor-firebase/messaging/android`.
  - That module depends on `com.google.firebase:firebase-messaging:25.0.1` unless `variables.gradle` sets `firebaseMessagingVersion` (FM/android/build.gradle:6, 56). `variables.gradle:1-16` doesn't.
- **AndroidManifest.xml:**
  - Declares `POST_NOTIFICATIONS` (99); the plugin's manifest declares it too (FM/android/src/main/AndroidManifest.xml:9). Also `INTERNET` (96).
  - The Firebase meta-data is already there (83-91):
    - `default_notification_icon` = `@drawable/ic_stat_vibe`
    - `default_notification_color` = `@color/vibe_accent` (#FF5C35, colors.xml:6)
    - `default_notification_channel_id` = `activity`
  - MainActivity is `singleTask` (24), exported, with the LAUNCHER filter (27-30) and an `autoVerify` App Links filter for `/auth/*`, `/campus`, `/messages`, `/posts/`, `/profile/`, `/orgs/` and `/settings` (46-64).
  - `allowBackup="false"` (9). There's no `firebase_messaging_auto_init_enabled` meta-data.
- The plugin's manifest merges in `MessagingService` (`exported=false`, action `MESSAGING_EVENT`) (FM/android/src/main/AndroidManifest.xml:3-7).
- **MainActivity.java:**
  - Creates the channels `messages` (IMPORTANCE_HIGH) and `activity` (IMPORTANCE_DEFAULT) on every launch, API 26 and up (27-28, 50-77). Their names and descriptions are in strings.xml:11-14.
  - It never asks for notification permission.
  - `SiteErrorPagesClient` (90-107) overrides only `onReceivedHttpError`, so `BridgeWebViewClient.onPageStarted` still calls `bridge.reset()` (CA/BridgeWebViewClient.java:62-64).
- **The icon matches the sender.** `res/drawable-{m,h,xh,xxh,xxxh}dpi/ic_stat_vibe.png` are tracked, and the sender sets icon `ic_stat_vibe`, color `#FF5C35` and `channel_id` `messages` or `activity` (src/lib/push/payload.ts:504-509).
- **Without google-services.json:**
  - There's no `google_app_id` resource, so Firebase's startup provider logs "FirebaseApp initialization unsuccessful". That's Firebase's behaviour, and it isn't a crash.
  - The plugin's `load()` doesn't touch Firebase (FirebaseMessagingPlugin.java:50-62; FirebaseMessaging.java:22-25).
  - `getToken`, `deleteToken` and the topic calls use `FirebaseMessaging.getInstance()`, which throws IllegalStateException ("Default FirebaseApp is not initialized…"). The plugin catches it and calls `call.reject(message)` (FirebaseMessagingPlugin.java:126-159, 228-258). **No crash, but also no error code: only the message.**
- **Permissions:**
  - The plugin's permission alias `receive` is `POST_NOTIFICATIONS` (FirebaseMessagingPlugin.java:28-34).
  - Below API 33, check and request just resolve `granted` (93-117).
  - On 33 and up it uses Capacitor's permission flow, and the state can also be `prompt-with-rationale`.
- **Foreground behaviour:**
  - FCM calls `onMessageReceived`, and the plugin fires `notificationReceived` only (MessagingService.java:15-19; FirebaseMessagingPlugin.java:82-89, 337-342).
  - FCM itself doesn't draw a notification message while the app is in the foreground, so **nothing shows unless the page shows it.**
  - iOS does show a banner in the foreground. The two platforms behave differently.
- **Android payloads:**
  - Foreground: `{id: messageId, data: getData(), title, body, clickAction, tag, link}` (FirebaseMessagingHelper.java:26-50).
  - Tap: `{id: google.message_id, data: <every intent extra>}` (52-64). So `data.url`, `data.tag` and `data.kind` are there, plus the `google.*`, `from` and `collapse_key` extras.

## 6. How a notification tap reaches the page
- **iOS:**
  1. UNUserNotificationCenter calls the router's `didReceive` (CI/NotificationRouter.swift:49-59). Only push triggers go to `pushNotificationHandler`.
  2. `FirebaseMessaging.didReceive` (FirebaseMessaging.swift:171-173) calls `appDidReceiveMessage`, then `plugin.handleNotificationActionPerformed`.
  3. The plugin calls `notifyListeners(…, retainUntilConsumed: true)` (FirebaseMessagingPlugin.swift:224-239).
- **Android, app already running:** MainActivity is `singleTask`, so the tap goes through `BridgeActivity.onNewIntent` and `Bridge.onNewIntent` to every plugin's `handleOnNewIntent` (CA/BridgeActivity.java:198-206; CA/Bridge.java:1312-1318).
  - The plugin acts only if the extras contain `google.message_id` (FirebaseMessagingPlugin.java:64-71), then calls `notifyListeners(…, true)` (344-350).
- **Android cold start:** `BridgeActivity.load()` calls `this.onNewIntent(getIntent())` right after it creates the bridge (CA/BridgeActivity.java:44-52). The launch intent takes the same path.
- **Held events (both platforms):**
  - With no listener for an event, the payload is queued under that event name and handed to the FIRST listener added (CI/CAPPlugin.m:42-66, 82-95; CA/Plugin.java:631-644, 665-727).
  - Every navigation resets the bridge. That clears listeners but NOT the queue (CI/CapacitorBridge.swift:315-318 and WebViewDelegationHandler.swift:45-48, 164-167; CA/Bridge.java:576-579 and BridgeWebViewClient.java:62-64).
  - **So a cold-start tap isn't lost.** It waits until the first page (`/campus`) calls `addListener('notificationActionPerformed')`.
  - This only works if that listener is registered for the whole app (root layout, in app mode), not on some pages.
  - JS `removeAllListeners` clears listeners, not the queue (CI/CAPPlugin.m:119-122; CA/Plugin.java:764-771).
- **iOS cold-start caveat (unverified):** the notification delegate is set at scene connect (§2), after `didFinishLaunching`, and Apple asks for it before launch finishes.
  - The Capacitor template before 8.5 also created the bridge after `didFinishLaunching` (on `makeKeyAndVisible`), so delivery probably still works. **This hasn't been tested on a device.**
  - Fallback, only if a device test shows a lost tap: in SceneDelegate, after `makeKeyAndVisible`, pass `connectionOptions.notificationResponse` to `(window?.rootViewController as? CAPBridgeViewController)?.bridge?.notificationRouter.userNotificationCenter(.current(), didReceive: r) {}`. The web side then has to dedupe.
- **Dedupe keys:**
  - Android: `notification.id`, which is `google.message_id`.
  - iOS: `notification.data["gcm.message_id"]`. The iOS `id` is the UNNotificationRequest identifier, not the FCM id.
- **Android replays taps.**
  - `onNewIntent(getIntent())` runs every time the Activity is re-created.
  - Android also re-delivers the original launch intent when the app is reopened from Recents after a notification cold start.
  - **So the same tap can fire again.** The page must dedupe by id and keep the last few ids in `localStorage`.

## 7. How the page knows the plugin exists
- **Both native bridges define** `Capacitor.isPluginAvailable = name => hasOwnProperty(Capacitor.Plugins, name)` (`mobile/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js:835`; the Android copy has the same line).
- **Stubs are injected once per registered plugin.** On iOS, JSExport (CI/JSExport.swift:73-99) builds `Capacitor.Plugins.FirebaseMessaging` with `addListener`, `removeAllListeners` and one function per `pluginMethods` entry (FirebaseMessagingPlugin.swift:16-30).
- **So `window.Capacitor.isPluginAvailable('FirebaseMessaging')` is true exactly when the binary includes the plugin.**
- **House pattern:** `getPlugin<T>("FirebaseMessaging")` in src/lib/native/bridge.ts:64-76 returns the stub or null. It checks `isNativePlatform` and never throws.
  - A newer site can meet an older binary (bridge.ts:60-63), so null has to be handled.
  - Use `getPlugin`, not an npm import.
- **"Is Firebase configured?" isn't exposed.** The only signal is `getToken` rejecting: code `UNAVAILABLE` on iOS, a plain message on Android. No native helper is needed.
- **JS surface wave 3′ needs:**
  - `checkPermissions()` and `requestPermissions()` return `{receive}`.
  - `getToken()` returns `{token}`. Also `deleteToken()`.
  - `addListener('tokenReceived'|'notificationReceived'|'notificationActionPerformed'|'apnsTokenReceived', fn)` returns `Promise<{remove}>`. Also `removeAllListeners()`.
  - `isSupported()` is always true on native.
  - Also available: `get/removeDelivered…`, the topic calls, and the channel calls (Android only; on iOS they're unimplemented, 189-199).
  - **There is no badge API.**

## Gotchas / open questions
1. **The plugin isn't installed (§0).** On iOS the first resolve clones `firebase-ios-sdk` and every package its manifest declares. The first `xcodebuild` then compiles FirebaseCore, Messaging, Installations, GoogleUtilities, nanopb and GoogleDataTransport from source. Run both in the background (the over-3-minute tool-call rule).
2. **Nothing native can be fully verified on this Mac.** The iOS gate is still blocked by the missing iOS 26.4 platform (README 65-78), so iOS is compile-only. Android can't build here at all (no SDK).
3. **Debug builds have no entitlements** (pbxproj 307-328, versus 334 in Release), so Debug never gets an APNs token.
   - Push testing needs a Release build, or `CODE_SIGN_ENTITLEMENTS` added to Debug. Either one needs the paid Apple team (App.entitlements:7-10).
   - A `CODE_SIGNING_ALLOWED=NO` simulator build drops the entitlement too.
   - **Open question: is the paid account live?**
4. **Console setup (Franky, not code):**
   - Upload the APNs `.p8` key to Firebase.
   - Register the iOS and Android apps as `app.connectvibe.vibe`.
   - Turn on the Push capability for the App ID.
   - No key goes in the repo.
5. **Getting the plist into the bundle is a decision (§4).** Recommend option b.
6. **Auto-init.** Without `FirebaseMessagingAutoInitEnabled=NO` (Info.plist) and `firebase_messaging_auto_init_enabled=false` (manifest), FCM creates a token and contacts Firebase on every launch, for everyone, before anyone opts in (README 80-92, 157-160).
   - Recommend both off.
   - `getToken` switches auto-init back on for good (FirebaseMessaging.swift:65; FirebaseMessaging.java:28), and `deleteToken` doesn't switch it off.
7. **Swizzling stays at the default (on).** It's harmless next to the plugin: both set `apnsToken` and call `appDidReceiveMessage`.
8. **The `didReceiveRemoteNotification` hook.** The README lists it, but:
   - Vibe sends no silent pushes (no `content-available` in payload.ts:510-516), and there's no `UIBackgroundModes`.
   - The plugin never calls the `completionHandler` it's passed (FirebaseMessaging.swift:126-134).
   - Leaving the hook out avoids a possible second foreground `notificationReceived` with no id.
   - If it's kept, call `completionHandler(.noData)` right after the post.
9. **`didFailToRegister`** is posted, but the plugin never observes it (43-47). A failed registration only shows up as a `getToken` error.
10. **First-launch race:** `getToken` can run before the APNs token exists, and then Firebase errors. The page should retry once and also listen for `tokenReceived`.
11. **Foreground behaviour differs:** iOS shows a banner, Android shows nothing (§5).
    - Recommend setting `presentationOptions: ["alert","badge","sound"]` explicitly, which matches "push all-on".
    - The alternative is `[]` plus an in-page toast on both platforms.
    - With the first option, iOS still shows a banner for the chat you're already looking at.
12. **iOS badge:** the sender sets `aps.badge` (payload.ts:512), and the plugin can't clear the icon badge. It stays until the next push.
13. **SPM symlink option (§1).** If it's used, add `symlinks/` to `CapApp-SPM/.gitignore`.
    - Today there's no identity clash. A local package's identity is the last part of its path (app, browser, filesystem, haptics, keyboard, share, splash-screen, status-bar, messaging), so the symlink is optional for now.
    - It would matter if `@capacitor-firebase/app` were ever added: its identity `app` collides with `@capacitor/app`.
14. **Privacy:** Firebase ships its own privacy manifests. Recheck CA92.1 (PrivacyInfo.xcprivacy:15-16), and add device ID / push token to the App Privacy label (S4).
15. **Two tap problems to handle:** the iOS cold-start tap is unverified, and Android replays taps from Recents (§6). Web-side dedupe is required either way.
16. **Mismatched config files:** a `google-services.json` for the wrong package fails the Gradle build. A plist for the wrong bundle id only logs.
17. **Re-check line numbers after install.** The `FM/` line numbers come from the scratch tarball; check them against `mobile/node_modules` once the package is installed (same version, 8.5.2).

## Recommended minimal native diff
```swift
// mobile/ios/App/App/AppDelegate.swift — add inside `class AppDelegate` (rest unchanged),
// and update comment lines 7-8. No Firebase import, no FirebaseApp.configure(): the plugin
// configures Firebase only when GoogleService-Info.plist is in the bundle
// (FirebaseMessaging.swift:16-21), so a build without the file can't crash.
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
```
The other native changes that go with it:
- **`capacitor.config.ts` `plugins`:** add `FirebaseMessaging: { presentationOptions: ["alert", "badge", "sound"] }`. Optionally add the `experimental` SPM symlink block together with its gitignore line.
- **Info.plist:** add `<key>FirebaseMessagingAutoInitEnabled</key><false/>`.
- **AndroidManifest `<application>`:** add `<meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false" />`.
- **pbxproj (App target):** add a Run Script phase after Resources, and set `ENABLE_USER_SCRIPT_SANDBOXING = NO` in both target configs. The script:
  ```sh
  PLIST="${SRCROOT}/App/GoogleService-Info.plist"
  if [ -f "$PLIST" ]; then cp "$PLIST" "${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/"
  else echo "warning: GoogleService-Info.plist missing: this build has no push"; fi
  ```
- **Debug `CODE_SIGN_ENTITLEMENTS`:** only once the paid team exists.
- **No change needed** in MainActivity, MainViewController or SceneDelegate. SceneDelegate gets the §6 fallback only if a device test shows a lost cold-start tap.
