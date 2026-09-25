# Vibe store apps (`mobile/`)

The App Store and Google Play apps are a Capacitor 8 shell: one full-screen web view
that opens `https://www.connectvibe.app/campus`. Every screen is the live website. The
app adds `VibeApp/1 (ios)` or `VibeApp/1 (android)` to the browser signature, and the
web code (`src/lib/native/detect.ts`) uses that to know it's inside the app.

This means **a Vercel deploy changes both store apps with no review.** Nothing that
sells, and nothing that changes what the app is for, ships without a new store build.

This folder is not part of the website. It has its own `package.json` and
`node_modules`, and it's excluded from the root `tsconfig.json`, `eslint.config.mjs` and
`.vercelignore`.

## THE REPO IS PUBLIC: never commit these

- Signing: `*.p8` (APNs key), `*.p12`, `*.cer`, `*.mobileprovision`, `*.jks` and
  `*.keystore` (Android upload key), `keystore.properties`, `*.pfx`.
- Firebase and Google: `google-services.json`, `GoogleService-Info.plist`,
  `*service-account*.json`, `*firebase-adminsdk*.json`.
- The Apple Team ID in `ios/App/App.xcodeproj/project.pbxproj` (see Signing below).
- `*.local.xcconfig`, and anything in `.build-logs/` (build logs carry paths and the
  environment).

The root `.gitignore` covers every pattern above. Keys live in the founders' password
manager, with a backup, and nowhere else.

## What's where

| Path | What it is |
|---|---|
| `capacitor.config.ts` | The app id (`app.connectvibe.vibe`), the live URL, the user-agent tag, plugin settings. No signing values, ever. |
| `www/offline.html` | The error page. iOS shows it for any failed load, Android for any page answering 400+. Try again goes to the live campus. |
| `www/index.html` | Required by Capacitor, never shown: it redirects to the live campus. |
| `resources/` | Icon and splash sources, rendered from `src/app/icon.svg`. `resources/store/play-icon-512.png` is the Play listing icon. |
| `scripts/` | `render-icon-source.mjs` (icons) and `check-release-config.mjs` (`npm run release:check`). |
| `ios/` | The Xcode project (Swift Package Manager, no CocoaPods). |
| `android/` | The Gradle project. |

`npx cap sync` writes copies of the config and `www/` into `ios/App/App/` and
`android/app/src/main/assets/`. Those copies are gitignored and rebuilt on every sync.

## Setup

```sh
cd mobile
npm ci
npx cap sync
```

Node 22 or newer. Versions are pinned exactly and `package-lock.json` is committed; when
Capacitor updates, bump every `@capacitor/*` package together and re-run `npx cap sync`.

## iPhone

Build check, run from the repo root (no signing, no simulator needed; the first run
downloads Capacitor's frameworks, so give it a few minutes):

```sh
xcodebuild -project mobile/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath mobile/ios/DerivedData build CODE_SIGNING_ALLOWED=NO
```

**That command needs the iOS 26.4 platform** (Xcode ▸ Settings ▸ Components, several
GB), which this Mac didn't have on 2026-09-24, so it has never passed yet. Without the
platform, xcodebuild finds no destination for the scheme, and even a target build stops
at the asset catalog and the storyboards ("iOS 26.4 Platform Not Installed"). That means
the app icon, the splash images and the storyboards have never been compiled. Until the
platform is installed, this proves the Swift code and every plugin compile and link,
and fails only on those three files:

```sh
xcodebuild -project mobile/ios/App/App.xcodeproj -target App -sdk iphonesimulator \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO -IDEBuildingContinueBuildingAfterErrors=YES \
  SYMROOT="$PWD/mobile/ios/DerivedData/TargetBuild" \
  -clonedSourcePackagesDirPath "$PWD/mobile/ios/DerivedData/SourcePackages"
```

To run it, open Xcode with `npx cap open ios`. For a simulator build from the command
line, use `CODE_SIGN_IDENTITY=-` (ad-hoc) rather than signing off.

## Android

Needs Android Studio (Otter 2025.2.1 or newer), SDK Platform 36 and an emulator image,
none of which are installed on this Mac yet. Point `JAVA_HOME` at Android Studio's
bundled JDK, not the system JDK 23. Then `npx cap open android`. `npx cap add` and
`npx cap sync` for Android run without the SDK.

## Local development (never against production data)

```sh
# 1. next dev in the repo root, against the LOCAL Supabase (supabase start).
#    Never a live .env: next dev and next start then write to the production database.
# 2. Point the app at it and open the iOS Simulator:
cd mobile
CAP_DEV_URL=http://localhost:3000 npx cap sync ios
npx cap open ios
```

- The iOS Simulator shares the Mac's network, so `localhost:3000` and the local
  Supabase at `127.0.0.1:54321` both resolve.
- An Android emulator or a real phone needs the Mac's LAN IP for the page AND for
  `NEXT_PUBLIC_SUPABASE_URL`, plus Next's `allowedDevOrigins` in `next.config.ts`. Not
  set up yet. Whether iOS allows a plain-HTTP LAN IP is untested.
- In a dev build, the error page's Try again opens the real site in Safari or Chrome:
  it goes to `https://www.connectvibe.app`, which isn't the dev server.
- **The dev URL sticks.** It's written into the synced copies and stays there until the
  next sync. Always finish with the release steps below.

## Releasing

Before every Archive (iOS) or bundle (Android):

```sh
cd mobile
npx cap sync            # WITHOUT CAP_DEV_URL
npm run release:check   # fails on a dev URL, cleartext, a Team ID, a keystore password,
                        # or a missing, misplaced or committed Firebase file (see Push)
```

### Signing

- **iOS.** Automatic signing under the CONNECTVIBE team. Picking the team in Xcode
  writes the Team ID into `project.pbxproj` twice: `DEVELOPMENT_TEAM = …;` in the build
  settings and `DevelopmentTeam = …;` in the target's `TargetAttributes`. The repo is
  public. Run `release:check` first, pick the team, Archive, upload from the Organizer,
  then discard both hunks: `git restore -p mobile/ios/App/App.xcodeproj/project.pbxproj`.
  `release:check` fails while either one is in the file (or staged), but nothing runs
  it for you: it only protects a commit if you run it before committing, every time the
  project file shows up in `git status`. The one place the Team ID is public by design
  is `public/.well-known/apple-app-site-association`.
- **Android.** Play App Signing holds the app-signing key; we keep only the upload
  keystore. Its passwords go in `android/keystore.properties` (gitignored), never in
  `build.gradle`.

## Icons and splash

```sh
cd mobile
npm run icons
```

This renders `resources/` from `src/app/icon.svg` with the website's own `sharp`, then
`@capacitor/assets` writes every iOS and Android size. The App Store refuses an icon
with an alpha channel; check it after every run:

```sh
sips -g hasAlpha ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   # hasAlpha: no
```

The generator doesn't write the Android notification icon or colours in `res/`; those
are hand-made and stay as they are. It also doesn't make the Play feature graphic
(1024×500), which is still to do.

## Plugins

App, Browser, Filesystem, Haptics, Keyboard, Share, Splash Screen, Status Bar, and
Firebase Messaging for push (see Push below). The web code reaches them through
`window.Capacitor.Plugins`, so the website bundle doesn't grow. `CapacitorHttp` and
`CapacitorCookies` stay off: on, they would replace `fetch` and `document.cookie` for
the whole site.

There is no `allowNavigation` list. On Android that's enough: any host other than
`www.connectvibe.app` (Stripe included) opens in Chrome. On iOS it isn't: Capacitor only
checks that an address *starts with* `https://www.connectvibe.app`, so a look-alike host
such as `www.connectvibe.app.example.com` would load inside the app with the native
plugins attached. The iOS project must close that itself, with a navigation guard in
`ios/App/App/MainViewController.swift` that sends every other host to Safari; don't
ship an iOS build without it. Don't "fix" it with a trailing slash on
`server.url`: Android would then open `//campus` and use a path as its bridge origin.
Before the first TestFlight, check on a phone that such a link opens in Safari.

## Push

Push notifications go through Firebase Cloud Messaging, with
`@capacitor-firebase/messaging` (pinned). The site talks to the plugin in
`src/lib/native/push-native.ts`; the server sends through `src/lib/push/send-fcm.ts`.

### The two Firebase files

Download both from the Firebase console, for the apps registered as `app.connectvibe.vibe`:

| File | Goes exactly here |
|---|---|
| `GoogleService-Info.plist` (iPhone) | `mobile/ios/App/App/GoogleService-Info.plist` |
| `google-services.json` (Android) | `mobile/android/app/google-services.json` |

- **Never commit them.** The root `.gitignore` covers both, and `release:check` fails if
  either is tracked or staged.
- **Never drag the plist into Xcode.** That adds it to the project as a resource, and
  every clone without the file then fails to build. Instead, the Run Script phase "Copy
  GoogleService-Info.plist" (after Copy Bundle Resources) copies it into the app when
  it's there and prints a build warning when it isn't. That phase needs
  `ENABLE_USER_SCRIPT_SANDBOXING = NO` on the App target, which is set. Android's
  `app/build.gradle` applies the google-services plugin only when the JSON exists.
- Without the files both apps build and run, but they can never get a push token; the
  site reads that as "not available in this build". `release:check` fails a release
  without them, or with a plist made for another bundle id (which Firebase would only log).
- Console setup, not code: upload the APNs `.p8` key to Firebase (it stays in the
  password manager, never here) and turn on Push Notifications for the App ID.

### Firebase stays quiet until the first opt-in, not after

- `FirebaseMessagingAutoInitEnabled` (Info.plist) and `firebase_messaging_auto_init_enabled`
  (AndroidManifest) are false, so a fresh install makes no FCM token and doesn't contact
  Firebase Messaging before a student turns notifications on.
- **The first opt-in switches auto-init on for good.** The plugin's `getToken` turns it on
  and has no way to turn it off again. From then on the Firebase SDK checks in at every
  launch, even after Turn off or Sign out, and mints a fresh token at the next launch
  after `deleteToken`. No server row learns that token without a new opt-in.
- Once the plist is in the app, the iPhone plugin also registers with Apple (APNs) at
  every launch. That never shows a prompt.
- Nothing of ours imports Firebase or calls `FirebaseApp.configure()`: the plugin
  configures it itself, only when the plist is in the app, so a build without it can't
  crash at launch. `AppDelegate.swift` only forwards the APNs device token to the plugin.

### Testing on a phone

- **Debug builds have no push entitlement** (`CODE_SIGN_ENTITLEMENTS` is set for Release
  only), so an iPhone Debug build never gets an APNs token. Test push with a Release
  build or TestFlight, signed with the paid team.
- **iPhone:** a push that arrives while the app is open still shows as a banner
  (`presentationOptions` in `capacitor.config.ts`). **Android:** FCM shows nothing
  while the app is open; the push only appears when the app is in the background.
- **Android 12 and older always report notifications as allowed**, even when the student
  switched them off in system settings, so "on" there doesn't prove anything will show.
- **Taps:** `src/components/native/NativeBridge.tsx` listens on every page load, opens only
  Vibe's own links, and ignores a tap it already handled (Android hands the tap that
  launched the app over again whenever it re-creates the app's screen). A tap that
  cold-starts the iPhone app hasn't been checked on a phone yet.
- **No app icon count yet.** The plugin has no badge API, and pushes don't set one.
