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
npm run release:check   # fails on a dev URL, cleartext, a Team ID or a keystore password
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

App, Browser, Filesystem, Haptics, Keyboard, Share, Splash Screen, Status Bar. The web
code reaches them through `window.Capacitor.Plugins`, so the website bundle doesn't
grow. Push (`@capacitor-firebase/messaging`) is installed in the push wave, with its
wiring, not before. `CapacitorHttp` and `CapacitorCookies` stay off: on, they would
replace `fetch` and `document.cookie` for the whole site.

There is no `allowNavigation` list. On Android that's enough: any host other than
`www.connectvibe.app` (Stripe included) opens in Chrome. On iOS it isn't: Capacitor only
checks that an address *starts with* `https://www.connectvibe.app`, so a look-alike host
such as `www.connectvibe.app.example.com` would load inside the app with the native
plugins attached. The iOS project must close that itself, with a navigation guard in
`ios/App/App/MainViewController.swift` that sends every other host to Safari; don't
ship an iOS build without it. Don't "fix" it with a trailing slash on
`server.url`: Android would then open `//campus` and use a path as its bridge origin.
Before the first TestFlight, check on a phone that such a link opens in Safari.
