# 3E map — contextual asks + "get the app" surfaces (wave 3′)

Read-only map, 2026-09-25. Every claim cites `file:line` at commit 55351a9.
Spec lines this serves: `research/critic.md:279` (3E row), `research/critic.md:158-175` (D3 ask rules),
`research-stores/critic.md:405-425` (3D → "Get the app", 3E native ask), `plan.md:68` (D3 = real store apps).

## 0. Branch table (what each surface does, by where the student is)

| Where | Detect with | Otto card | First-DM line | Post-tour Campus card | Desktop onboarding |
|---|---|---|---|---|---|
| Store app (iOS/Android) | `useAppShell()` → `"ios-app"`/`"android-app"` (`src/lib/native/use-app-shell.ts:47`) | native push ask (3B `turnOn()`) | native push ask | "Turn on notifications" | n/a |
| Installed web app | `useIsStandalone()` (`src/lib/pwa/use-standalone.ts:63`) and shell null | web push ask | web push ask | web push ask | n/a |
| Mobile Safari / Chrome tab | `usePlatform()` (`use-standalone.ts:94`) + `isIosPlatform()` (`display-mode.ts:165`) / `startsWith("android-")` | nothing (critic: "installed only") | "Get the app" → `/get` | "Get the app" | n/a |
| In-app browser (IG/TikTok) | platform `"ios-in-app"` / `"android-other"` (`display-mode.ts:137-140`) | nothing | "Open in Safari first" (3D) | same | n/a |
| Desktop | `desktop-*`, `firefox`, `other` | nothing | nothing | nothing (phone-only tree) | QR card → `https://www.connectvibe.app/get` |

Rule: ask `useAppShell()` FIRST for "am I in the app?" — `usePlatform()` answers "which browser" and
`isIosPlatform("ios-app")` is deliberately false (`display-mode.ts:155-164`, `use-app-shell.ts:18-20`).
All three hooks return null/false during hydration (`use-standalone.ts:8-15`, `use-app-shell.ts:12-17`):
render nothing until the value is non-null or the card will flash.

## 1. Otto tab — `src/components/mobile/OttoMobile.tsx` (491 lines, read whole)

Structure (`OttoMobile`, `:43`):
- `<main>` dark gradient `#1A1A1F→#0E0E13` with coral/lavender glows `:219-228`.
- `<header>` hero: orb `:239-261`, "otto." h1 `:262-273`, tagline `:274-296`, CountChip row `:298-320`.
- Tab strip Today / Stats `:324-342` (`TabPill` `:426-457`).
- Swipeable panes `:345-399`:
  - Today `<section>` `:368-392` → `OttoActivity` `:375`, `OttoUpcoming` `:376-381`,
    `OttoRequests` `:382-389`, `OttoTellInput` `:390`, `OttoSettings` `:391`.
  - Stats `<section>` `:393-398` → `OttoMetrics`.
- `paneStyle` = column flex, `gap: 14`, padding `4px 14px 32px` (`:404-412`).

Where "Get these on your lock screen" goes: **first child of the Today section, before `OttoActivity`
at `:375`** (visible without scrolling; Today is the default tab `:45-47`). Alternative: directly above
`OttoSettings` at `:391`, whose toggles are the pings themselves ("Ping me about RSVPs…", "Ping on
mentions", "Daily summary" — `src/components/otto/OttoSettings.tsx:60-65`). Recommend top of Today.
Put it in a new file (e.g. `src/components/otto/OttoPushCard.tsx`) so OttoMobile only gains one line.

Existing styles to reuse (all dark-glass, match this screen):
- `OttoSection` shell (`src/components/otto/OttoSection.tsx:22-35`): eyebrow + coral divider + body;
  classes `.otto-room-section` (`src/app/globals.css:1946-1956`), header `:1958`, eyebrow `:1967`,
  optional `trailing` slot `:1988` (fits an "×" / "Not now").
- Buttons `.otto-room-action` / `.otto-room-action--primary` (`globals.css:2148-2176`), already used
  for Connect/Pass in `OttoRequests.tsx:57,94,103`. NOTE: 6px×12px padding → below 44px tap height.
- `CountChip` pill `OttoMobile.tsx:460-491` (inline styles; not a card).
No dismissible card or banner exists on this screen today.

## 2. Messages — `src/components/mobile/MessagesMobile.tsx` (4746 lines, ranged reads)

Two components:
- `MessagesMobile` (list page) `:304-630`, props `initialHandle`, `initialChannelId` (`:305-310`).
- `ConversationView` (one thread) `:936+`, **exported and reused by CampusMobile for org channels**
  (`CampusMobile.tsx:23,792`). Props `threadId, thread, onClose, onThreadsChanged?, backdropCss?`
  (`:936-954`). `darkMode` = `!!backdropCss` (`:1659`); only org channels pass a backdrop.

Send flow — `send` (`useCallback`, `ConversationView`) `:1101-1215`:
- media branch: sign `:1120-1128` → PUT `:1137-1143` → POST `:1144-1148`, success at `:1149-1154`.
- text branch: optimistic temp row `:1158-1173` → POST `:1174-1177`; failure rollback `:1178-1182`;
  **success** `:1183-1188`.
- common success tail `:1190-1199` ("Sent." comment `:1190`) — **the hook point for the first-DM ask**,
  after `setReplyTo` and before `finally` `:1200`. Gate on `thread?.type === "dm"` (type at `:57-59`)
  so org channels (CampusMobile) and groups don't trigger it. A reply to a request also lands here
  (`isRequest` `:1092`, `:1196-1199`) — decide whether that counts (it is a DM send).
- Submit wiring: `<form onSubmit>` → `send()` at `:1902-1907`.

"First DM ever": **no counter/flag exists** — no `localStorage`/`sessionStorage`/`_v1` anywhere in the file
(grep empty). `ThreadEntry` (`:57-86`) carries only `last_message.user_id`, which can't prove "first ever".
Use a per-device key, e.g. `vibe_first_dm_ask_v1` (set once the ask has been shown; every storage call in
try/catch, storage failure = don't show). Semantics become "first DM sent on this device".

Where the ask renders: a one-line strip **above the composer**, copying the message-request bar
pattern `:1688-1700` (`flexShrink: 0`, `padding: 12px 16px`, `background: rgba(255,92,53,0.06)`,
`borderTop: 1px solid rgba(28,28,30,0.08)`, DM Sans). Order above the composer today: request bar
`:1688-1756` → reply pill / staged media `:1758-1900` → `{/* Input bar */}` form `:1902-1903`. Insert the
strip right after `:1756` (the request bar's slot; it and the ask can't both show because a reply accepts
the request `:1196-1199`). Local state in ConversationView (`showPushAsk`), set in the send success tail.

Thread-list fetch — `refetchThreads(mode: "first" | "refresh")` `:365-393` (`GET /api/me/threads`,
`cache: "no-store"`, sequence guard `listSeqRef` `:367,377`, `quiet` for first loads `:372`). Mirrored into
`refetchThreadsRef` and fired once on mount `:395-398`. Other callers: Retry `:576`, `onThreadsChanged`
`:614`, `onClose` `:615-618`, handle-resolve `:347,445`.

`visibilitychange` / `focus` listener: **none** — confirmed (no `visibilitychange`, `focus`,
`pageshow`, `setInterval` or realtime subscribe in the file; no `visibilitychange` anywhere under
`src/components/mobile/`). Critic G2 (`research/critic.md:77`) wants a refetch on `visible`. Add one
`useEffect` next to `:395-398`: on `document.visibilityState === "visible"` →
`void refetchThreadsRef.current?.("refresh")`. Note `"refresh"` toasts on failure once the list has
loaded (`:385-390`); a background return probably wants silence → pass a quiet mode or add a third mode.
Existing pattern to copy: `src/components/pwa/ServiceWorkerRegistrar.tsx:101-106`,
`src/app/campus/campus-home.tsx:4150-4160`.

`?channel=` deep link: server reads it in `src/app/messages/page.tsx:26-31` → `initialChannelId` prop
(`:34`). Client opens it at `MessagesMobile.tsx:405-411`: `initialChannelResolvedRef` guard, then
`setOpenThreadId(initialChannelId)`. **The ref never resets**, so a second push tap that soft-navigates to
`/messages?channel=<other>` while Messages is mounted changes the prop but does NOT open the new thread.
`?to=<handle>` has the same one-shot ref `:419-448`. Push-tap wave (3B) must either hard-navigate or key
the guard on the id (`lastOpenedChannelRef !== initialChannelId`).

## 3. Campus — `src/components/mobile/CampusMobile.tsx` (3996 lines, ranged reads)

Tour: `useMobileTour("campus")` at `:138`. Engine in `src/components/mobile/use-mobile-tour.ts`:
- Keys: `vibe_tour_pending` (`:66`), seen keys `vibe_campus_tour_seen_v1` etc. (`:67-71`).
- Start rule `tourStartDecision` `:205-209`: pending flag names the leg, or campus leg on `?welcome=1`
  and not seen. Campus leg is where the phone tour ends (`:21-25`, `HANDOFFS` `:151-155`).
- **"Tour finished" = `localStorage.vibe_campus_tour_seen_v1 === "1"`**, written by `handleDone`
  (`:362-366`) on BOTH "Got it" and skip. No user/DB flag. No event is fired — React doesn't learn the
  tour ended until a remount. `window.OttoTour.isRunning()` exists (`:51`, used `:285`).
- Tour targets on this page: `#otto-mobile-tour-tabs` `:664`, `#otto-mobile-tour-feed` `:680`,
  `#otto-mobile-tour-compose` `:3461`.

Banner slot: the critic's "~:631" is now **`:654-661`**:
```
<div hidden={tab === "map"}>        // :659 — hidden on Map (map height assumes nothing here)
  <CampusConfirmBanner />           // :660
</div>
```
It sits under the Otto strip (`:617-652`) and above the sticky tab header (`:663`, `id` `:664`). Wrapper has no
padding, so an empty banner adds no height (`:655-658`).

`CampusConfirmBanner` (`src/components/mobile/CampusConfirmBanner.tsx`, 212 lines):
- Fetches `/api/me/onboarding-state` itself `:38-52`; pure view `campusConfirmBannerView`
  (`campus-confirm-banner-view.ts`); "Not now" → **sessionStorage** `vibe_campus_confirm_dismissed`
  (`campus-confirm-banner-view.ts:13`, `CampusConfirmBanner.tsx:56-63,169-175`).
- Card chrome to copy: `padding: 10px 12px 0` wrapper, `borderRadius: 18`, `rgba(255,253,248,0.78)`,
  inset + soft shadow `:84-94`; Fraunces 16/800 title `:96-105`; DM Sans 13 body `:106-116`;
  44px pill buttons `primaryButton`/`secondaryButton`/`textButton` `:177-212`.

"One banner at a time": **no rule exists in code** (grep for it is empty). It exists only as a spec
line: `research/critic.md:163-164` ("never during the welcome tour, never alongside the campus-confirm
banner", 14-day "Not now") and `:278` (`vibe_install_nudge_v1`, 14-day snooze). CampusConfirmBanner does
not expose whether it is showing, so enforcing it needs either an `onVisibleChange` prop on the banner or
lifting its fetch into a small slot coordinator that renders at most one card.

Where the post-tour card goes: **same slot, `:659-661`**, as a sibling rendered only when the confirm
banner is not showing. Show when: tour not running AND not on `?welcome=1` AND (seen key set OR a later
session) AND not snoozed. Store app → "Turn on notifications" (native ask); mobile browser tab → "Get the
app" (hidden while that platform's store URL is unset, see §5); installed web app → web push ask.

## 4. Desktop onboarding — `public/html/onboarding.html` (4033 lines, grep + ranges)

Who sees it: desktop only. `/onboarding` forks by viewport in `src/app/onboarding/OnboardingSwitch.tsx`
(phone → `OnboardingMobile`; desktop → iframe of `/onboarding/classic`, a route handler that serves this
file with injected boot JSON: `src/app/onboarding/classic/route.ts:34-52,124`). A wide iPad also gets it.

Step structure: six `<section class="onb-step" data-step="N">` — 1 hello `:469`, 2 campus `:486`,
3 profile `:525`, 4 photo `:595`, 5 clubs `:614`, **6 people (final) `:637-660`**. Order doc at `:702`;
`DRAFT_TOTAL_STEPS = 6` `:1624`; `showStep(n)` `:2160`; progress dots `:452-460`.
Step 6 layout: otto-sm orb `:638-642`, `h2` `:643`, `sub-intro#onbPeopleOtto` `:644`, `.onb-list` `:645-655`,
`.cta-row` with `#onbFinish` `:657-659`. Finish handler `finish()` `:3674+` → `succeed()` `:3663-3672`
sets `vibe_tour_pending=campus` `:3665` and hyperdrives to `/campus?welcome=1` `:3670-3671` (desktop
campus). Replay: `IS_REPLAY` → straight to `/campus` `:3676-3679`. Listener wiring `:3918`.

Where the card fits: **inside step 6, between `.onb-list` (closes `:655`) and `.cta-row` (`:657`)**.
Finish navigates away at once, so the card must be seen before Finish, not after. (Alternative: the desktop
campus welcome at `src/app/campus/campus-home.tsx` — not mapped here.) Step 6 max-width is 560px
(`:259`); the step is a centred column (`.onb-step` `:100-106`).

Copy convention: every string lives in `ONB_COPY` (`:768+`; people block ends `finishFailed` `:883`) or
`ONB_LOCAL_COPY` (`:1080`), bound by `data-copy="people.xxx"` via `applyCopy()` `:2059`
(comment `:443-444`). Add e.g. `people.getApp`, `people.getAppBody` there — no literal text in markup.

CSS conventions: tokens on `:root` `:26` (`--cream #FAF7F2`, `--charcoal #1C1C1E`, `--accent #FF5C35`,
`--purple`, `--lavender`, `--green`); dark charcoal page, white text, custom cursor (`cursor: none` `:32`, `:40`);
fonts Fraunces + DM Sans from Google Fonts `:16`. Headline `.h2` `:146`, italic Fraunces `.sub-intro`
`:148`, `.cta-row` `:151,257`, `.btn-coral` `:152-160`, `.onb-empty` card `:351-356`, `.people-top`
`:357-358`, `.btn-share` `:359`. No existing "card" class for a boxed panel — a new `.onb-getapp` using
`rgba(255,255,255,.06)` fill + `0.5px rgba(255,255,255,.12)` border matches `.onb-back` `:56+`.

QR: **no QR library** — `package.json` has no `qrcode`/`qrious`/`kjua`, `node_modules` has none, and nothing
in `public/html` or `src` generates one. Only CDN script in `public/html` is pdf.js from cdnjs
(`public/html/profile.html:4784`). No CSP (`next.config.ts:49`, `:92`); `X-Frame-Options: SAMEORIGIN`
(`:67`) is fine for the same-origin iframe. **Recommendation: a pre-generated static SVG** — the URL is
fixed, so encode `https://www.connectvibe.app/get` once and commit it, either inline in step 6 or as
`public/icons/get-qr.svg` via `<img>`. Precedent for "generate once, commit output":
`scripts/gen-pwa-icons.mjs` (+ `scripts/check-pwa.mjs`). Generating needs an encoder (a devDependency or a
one-off `npx`), which is a download → Franky's call; do not hand-roll an encoder. Dark page: draw the QR
dark-on-cream inside a light tile (scanners want dark modules on light, with a quiet zone).

## 5. `/get` and store links

`src/app/get/route.ts` exists as a **route handler, not a page** — it shows nothing, it 307s by user agent
(`:45-68`): store app → `/campus` (`:52-55`); iOS → `NEXT_PUBLIC_APP_STORE_URL` else `/campus` (`:56-58`);
Android → `NEXT_PUBLIC_PLAY_STORE_URL` else `/campus` (`:59-61`); everything else → `/` (`:51`).
`private, no-store` + `Vary: User-Agent` (`:64-66`). Store URLs are only trusted with the store's prefix
(`storeListingUrl` `:35-43`). Env vars documented at `.env.example:63-71` (unset today; build-time inlined).

Other users of the env vars: only `src/components/landing/home-landing.tsx` — its own private copies of
`storeListingUrl` `:51-59`, `APP_STORE_URL`/`PLAY_STORE_URL` `:61-68`, `StoreLink` objects `:70-77`,
`storeLinksFor(platform)` `:86-90`, and `StoreLinks()` `:345+` (plain text links, no badge art by design,
TODO for official badges + a QR `:336-341`). No `GetTheApp`, `StoreBadge`, `apple-itunes-app` or
`related_applications` anywhere in `src/` or `public/html`. → 3E should extract a shared client-safe
module (e.g. `src/lib/native/store-links.ts`) instead of a third copy.

## 6. Reusable phone card / dismiss primitives

- Only dismissible phone card today: `CampusConfirmBanner` (§3) — session-scoped "Not now", pure view
  module tested in `campus-confirm-banner-view.test.ts`. Copy its split (pure `*-view.ts` + thin TSX).
- No localStorage **timestamp snooze** exists anywhere (grep `snooze|dismissedAt|DISMISS*KEY` empty).
  `_v1` keys in use: `vibe_campus_tour_seen_v1` / `vibe_profile_tour_seen_v1` / `vibe_network_tour_seen_v1`
  (`use-mobile-tour.ts:67-71`, `SettingsClient.tsx:139-141`), `vibe_recent_searches_v1`
  (`campus-home.tsx:4590`), `vibe_user_v1`, `vibe_otto_v1` (desktop). New keys proposed:
  `vibe_push_ask_v1` (Otto + Campus, `{dismissedAt}` epoch ms, 14-day snooze per critic `:163-164`) and
  `vibe_first_dm_ask_v1` ("1" once shown). Every call in try/catch; failure ⇒ render nothing.
- Style sources: cream card = `CampusConfirmBanner.tsx:84-212`; dark card = `OttoSection` + `.otto-room-*`.

## 7. Manifest — `src/app/manifest.ts`

**No `related_applications`** (return object `:51-74`: id, name, start_url `/campus`, scope `/`,
standalone, cream colours, `launch_handler`, 4 icons, 2 shortcuts). research-stores 3D lists it as a
to-do; it needs the Play package id / App Store id, which don't exist yet. Don't set
`prefer_related_applications: true` — Chrome would stop offering web install.

## 8. Platform helpers (exports only)

- `src/lib/pwa/display-mode.ts`: `type DisplayModeEnv` `:19`, `isStandalone(env)` `:41`, `type Platform`
  `:55-67` (`ios-app | android-app | ios-safari | ios-other-browser | ios-in-app | android-chrome |
  android-samsung | android-other | desktop-chromium | desktop-safari | firefox | other`), `type
  PlatformEnv` `:70`, `detectPlatform(env)` `:125` (store app checked first `:131-132`),
  `isIosPlatform(p)` `:165` (false for `ios-app`).
- `src/lib/pwa/use-standalone.ts`: `useIsStandalone()` `:63` (subscribes to display-mode changes),
  `usePlatform()` `:94` (read once, cached).
- `src/lib/native/use-app-shell.ts`: `useAppShell(): AppShell | null` `:47`.
- `src/lib/native/detect.ts`: `type AppShell` `:15`, `detectAppShell(ua)` `:26`, `appShellOnClient()` `:44`.
- `src/lib/native/server.ts`: `appShellFromHeaders(h)` `:26`, `appShellFromRequest()` `:34` (server side).
- `src/lib/pwa/install-prompt.ts`: `getInstallPrompt()` `:54`, `onInstallPromptChange()` `:59`,
  `wasInstalledThisSession()` `:67` (Android/desktop web install only; D3 made store apps the install path).
- `src/lib/native/bridge.ts`: `getPlugin` `:67`, `listenNative` `:102`, `openInBrowser` `:137`
  (store app → open a store/`/get` link outside the web view), `nativeShare` `:183`.
- Not yet present: any client push helper (`src/lib/push/` is server-side only; no `push-client.ts`,
  no `src/lib/native/push-native.ts`). 3E's buttons call 3B's `turnOn()`; 3E can't land before 3B.

Branch recipe for every ask:
```
shell = useAppShell(); standalone = useIsStandalone(); platform = usePlatform();
if (platform === null) → render nothing (hydrating)
if (shell)            → native push ask
else if (standalone)  → web push ask (iOS: only works installed, so this is the only iOS web case)
else if (isIosPlatform(platform) || platform.startsWith("android-")) → "Get the app" (only if that store URL is set)
else                  → nothing (desktop handled by onboarding QR)
```
Also hide every ask when push is already on for this device, or permission is `denied` (show nothing;
Settings 3A owns the "how to re-enable" copy).

## Gotchas / open questions

1. **Deep-link one-shot ref** (`MessagesMobile.tsx:405-411`): a second `?channel=` while mounted is ignored.
   Push taps must hard-navigate or the guard must track the last id. Flag to the 3B owner.
2. **Visibility refetch toasts**: `"refresh"` mode toasts on failure (`:385-390`); returning from the lock
   screen offline would toast. Use a quiet variant. Also debounce — iOS fires `visibilitychange` often.
3. **"Tour finished" is invisible to React**: the seen key is written in `handleDone`
   (`use-mobile-tour.ts:362-366`) with no event. A card that should appear right after "Got it" needs a
   `CustomEvent` from `handleDone` (touches `use-mobile-tour.ts`, another owner?) or it shows next visit.
4. **Seen key is per device**: a student who onboarded on desktop never gets `?welcome=1` or the pending
   flag on the phone (flag is set in desktop localStorage, `onboarding.html:3665`), so the phone tour may
   never run and the seen key never be set. Don't gate the Campus card on the seen key alone — use
   "tour not running and not on `?welcome=1`" plus the snooze.
5. **One-banner rule has no mechanism**: `CampusConfirmBanner` hides its own state. Needs an
   `onVisibleChange` prop or a slot coordinator; it also means a third `/api/me/onboarding-state` read
   on /campus (banner `:41` + tour `use-mobile-tour.ts:225`) if the coordinator refetches.
6. **"Get the app" with no store URL is a loop**: `/get` sends a phone to `/campus` while its env var is
   unset (`get/route.ts:56-61`) — i.e. back where the card was. Render the card only when that platform's
   URL is set (same rule as the landing, `home-landing.tsx:79-90`). Today both are unset
   (`.env.example:70-71`), so in mobile Safari every "Get the app" surface renders nothing until launch.
   Open: while Apple is late, fall back to the iPhone Add-to-Home-Screen sheet (research-stores 3D)?
7. **Store-link logic is duplicated and private** (`get/route.ts:35-43`, `home-landing.tsx:51-90`).
   `storeLinksFor` also treats `"android-app"` as Android (prefix `android-`) and `"ios-app"` as desktop —
   extract a shared module that handles the shell explicitly before 3E adds a third copy.
8. **ConversationView is shared** with CampusMobile org channels: gate the first-DM ask on
   `thread?.type === "dm"`, and org channels render dark (`backdropCss`), DMs cream.
9. **"First DM ever" can't be known client-side** — per-device key only. Open: accept "first DM on this
   device", or add a server flag (e.g. return `has_sent_dm` from `/api/me/threads`)? Recommend the key.
10. **QR generation needs an encoder** (none installed). Adding a devDependency or running `npx` is a
    download → needs Franky's OK. Fallback: Franky generates the SVG once and commits it.
11. **iPad gets desktop onboarding** (viewport fork) → a QR on an iPad is odd; optionally hide the card
    when `maxTouchPoints > 1`. The app is iPhone-only (`get/route.ts:14-19`).
12. **Tap targets**: `.otto-room-action` is ~26px tall; the ask buttons need `minHeight: 44` like
    `CampusConfirmBanner.tsx:177-190`.
13. **Otto card condition** says "installed only" (`research/critic.md:279`): so no "Get the app" on the
    Otto tab in a browser. Confirm with Franky; the store-first decision (D3) may want it there too.
14. **Copy for store app**: "Get these on your lock screen" must not mention installing; inside the store
    app the Campus card says "Turn on notifications", never "Get the app" (`home-landing.tsx:339-341` TODO).

