# Session 66 — push, the student's side (2026-09-25)

## START HERE — session 67

1. **Ask Franky how the Sept 26 founders' meeting went** (it hadn't happened yet when S66 ran on Fri Sept 25). The
   roadmap (https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi, v8) carried recommendations the meeting was meant to
   confirm or change: the one-sentence pitch (25-minute workshop), first-club traits, the seven-line "how we work",
   who's named on the LLC, club pages created by student officers, movable profile widgets free. Record the decisions
   in memory `project_launch_plan.md` BEFORE building anything.
2. **Push is fully built and dark.** Nothing more to code until Franky's four steps (below). The next engineering is
   S3D (link files, blocked on the Apple Team ID + Play SHA-256), S4 (submission kit, blocked on store accounts),
   wave 4 (update toast, runbook, device checklist), and the security pass (both sentinels over everything since
   Sept 3). Pick with Franky.
3. **Facts:** James runs the paperwork and does NOT own the company. **Zero clubs signed** (SAE is a test page). The
   repo is PUBLIC. The journal is at **v7.8 / Session 66**; next entry v7.9 / Session 67.

## OPEN with Franky (end of S66, 2026-09-25) — ask about these first

- **D-U-N-S: NOT submitted yet** ("I'll do that later"). The critical path: submit via developer.apple.com/enroll/duns-lookup,
  signed in as Franky. Legal name `CONNECTVIBE. LLC` (with the period); his title Member / Co-Founder; a phone and email
  he answers. Takes up to 5 + 2 business days, so about Oct 6 if submitted this weekend. Never D&B's own web form. Ask
  whether it's in, or whether the tool found an existing number.
- **Settled today:** the LLC is **multi-member and Franky is named on it** (James), so Franky can be the Apple Account
  Holder. **Address = Franky's personal address for now** (his call, trade-offs explained). Every later record (D&B,
  Apple, Google payments profile, INBiz) must use the exact same string; add it to the Indiana filing later.
- **Still to check:** member-managed vs manager-managed is whatever the filed Articles say (INBiz, business ID
  202605081999327), not something to choose on a form. If manager-managed, Franky must be a named manager or have a
  one-line authorization.
- **Individual Apple account = the Oct 9 fallback only** (his name as seller, personal liability, cofounders, an unclear
  move to the LLC later). Google personal accounts need 12 testers × 14 days, so the D-U-N-S is needed regardless.
- Also from today: share the roadmap link with James and Rylan before the Sept 26 meeting.

## What shipped (Vercel green both times, 82/82 PWA checks live)

| Commit | What |
|---|---|
| `1a0da72` | Wave 3′a: Settings → Notifications card; `src/lib/pwa/device-push.ts` (one client library for web push + FCM); `leaveDeviceClean` on every sign-out; `GET /api/me/push-devices`; DELETE by address any owner; sw.js one-notification-per-thread + SIGNED_OUT clears shown notifications; `@capacitor-firebase/messaging` 8.5.2 wired (auto-init off, token forwarders only, plist copied by a build step); iOS `aps.badge` paused |
| `47c61a1` | Wave 3′b: `src/components/push/PushAsk.tsx` (Otto / Campus / first-DM asks, "Get the app" once store URLs exist); Messages quiet refetch + deep links that change while open + per-thread remount; `/get` + landing on `store-links.ts`; desktop onboarding QR (`public/icons/get-qr.svg`) |
| (this commit) | Journal v7.8 / Session 66 |

- **Production verified dark** (Franky's own account in the gstack browser): no card, `available:false`, no key, the
  new worker (`2026-09-25-2`) active. Production DB unchanged at `20260923090000`.
- **Plan + contracts:** `handoffs/wave-plan-pwa/plan.md` §8 (W1–W15, §8.2 contracts, §8.6 as built, §8.7 wave 3′b).
  Critic: `critic-w3.md` (0 blocker, 7 major, 19 minor — all ruled). Maps: `w3-maps/`.

## Verified by hand (local practice copy + iPhone simulator)

- Settings card at 375 px as a non-admin (blake): renders, 52×44 switches, `#notifications` scroll; prefs saved to
  `otto_settings.push` exactly; previews-only save keeps `off`; Mentions → `mention_pings:false`, never "mention" in
  `off`; Otto preset leaves it alone.
- Settings sign-out: logout body carries the device address, every device row deleted, 12 per-device keys cleared,
  tour flag + tap record kept, lands on /auth/login.
- Shared browser: blake's leftover record → casey signs in → next load deletes blake's device and drops the record.
  A record with no live subscription is cleaned up on load (rule 8); another device of the same student is untouched.
- iPhone app (simulator, pointed at local dev): the card shows; the switch tap brings up Apple's permission prompt;
  with no plist the app says "Notifications aren't set up in this version of the app yet." Campus ask (cream) and
  Otto ask (dark) render; "Not now" hides; "Turn on" shows the same no-plist message and steps aside. App launches
  without the plist (no crash). Simulator config restored to the live site afterwards.
- `next build` (local env) clean, no `node:crypto` in client chunks. Desktop onboarding QR card renders; the QR decodes
  (macOS Vision) to `https://www.connectvibe.app/get`.

## Not verified (needs a device, real Chrome, or Franky's keys)

- A real web-push subscription and delivery (the browser pane denies notifications); W8 thread-close in Chrome /
  Firefox; the badge; iOS 18.4+ declarative pushes.
- Real FCM token, delivery, taps (cold start on iOS is the open question — critic-w3 item 12), Android anything,
  Android < 13 reading "granted".
- Keyboard/VoiceOver pass of the card and the asks.

## Franky's queue (unchanged critical path + push)

1. James: how CONNECTVIBE. LLC is registered + a public business address. 2. D-U-N-S. 3. @connectvibe.app mailbox.
4. Company Google account → Firebase project + Play Console. 5. Apple Developer org ($99), decision gate **Oct 9**.
6. Lawyer by ~Oct 14. 7. **Turning push on (founders only):** (a) yes to the production migration
   `20260924120000_push_notifications`; (b) VAPID pair once → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` on Production only, never rotate; (c) Firebase: upload the APNs key, add
   `mobile/ios/App/App/GoogleService-Info.plist` + `mobile/android/app/google-services.json` locally (NEVER commit, never
   drag into Xcode), `FCM_SERVICE_ACCOUNT_B64` on Production; (d) `PUSH_ENABLED=true`, `PUSH_ALLOWLIST=<founder ids>`.
   **Set `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL` only after FCM is live** (the "Get the app" card
   promises lock-screen notifications). 8. Android Studio.

## Follow-ups found this session (not done)

- Store-app icon badge: wave 4 (a tiny local Capacitor plugin in MainViewController, or clear-on-open).
- Android shows nothing for a push that arrives while the app is open (FCM default); iOS shows a banner. Decide after
  the device pass (an in-page toast on `notificationReceived` is the likely fix).
- In the app, the Settings card can stay blank up to ~23 s when `getToken` is slow (it waits for the token on read).
- "Same notification tapped again after closing that chat" doesn't reopen it on a soft navigation (push taps are full
  loads, so real taps are fine).
- Pre-existing, flagged as a task chip: the phone Campus feed card nests a button in a button (hydration warning).
- `public/html/onboarding.html` desktop-only copy lives in `ONB_DESKTOP_COPY` (ONB_COPY must stay identical to
  `onb-copy.ts`).
- Local-only test setup in the gitignored `.env.development.local`: a LOCAL VAPID pair, `PUSH_ENABLED`, allowlist =
  blake + casey, and a FAKE FCM service account (throwaway key). Remove the fake FCM block if it ever confuses a test.

## How to work in this repo now

- Same as the S65 handoff (`2026-09-25-session-65-next-waves.md`, "How to work"). New: to walk the iPhone app against
  local dev, `CAP_DEV_URL=http://localhost:3000 npx cap copy ios`, rebuild, launch; to sign a test account in inside the
  app, temporarily point the gitignored `ios/App/App/capacitor.config.json` `server.url` at the magic-link confirm URL
  (drop `appStartPath`), rebuild, tap Confirm, then re-copy with `CAP_DEV_URL` (cookies persist). **Always finish with a
  plain `npx cap copy ios`** so the synced config points at the live site. A browser Sign out ends the app's session
  too (logout is global).
