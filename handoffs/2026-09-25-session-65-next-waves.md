# Next waves — start here (written end of session 65, 2026-09-25)

## START HERE — session 66

1. **Ask Franky how the Sept 26 founders' meeting went.** The roadmap (https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi,
   version 8) carried recommendations the meeting was meant to confirm or change: the one-sentence pitch (built in a
   25-minute workshop), the first-club traits, the seven-line "how we work", who's named on the LLC, club pages created
   by student officers (+ club school email for the verified mark), movable profile widgets free with flair as Vibe+,
   and the Decide-Saturday table. Record what was decided in memory (`project_launch_plan.md`) before building.
2. **Then build wave 3′ (push, phone side)** — the plan is below. Nothing else is unblocked until the paperwork moves.
3. **Facts to never get wrong again:** James runs the paperwork and does NOT own the company (Franky is probably on the
   LLC filing too). **Zero clubs are signed** — SAE is Franky's own chapter used as a test page. The repo is PUBLIC.
4. **The journal is at v7.7 / Session 65** (`55351a9`); the next entry is v7.8 / Session 66.
5. **Roadmap source:** `handoffs/roadmap-2026-09-25/roadmap-v8.html` (republish to the same URL with `Artifact` publish
   `url: https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi`, after reading it). Research behind it is in the same folder.
6. **Local production build helper** (LOCAL env only, no Sentry upload): `handoffs/wave-plan-pwa/local-build.mjs`,
   run from the repo root with `node handoffs/wave-plan-pwa/local-build.mjs`.


The full session record is `2026-09-24-session-65-installable-app-and-store-shell.md` (§1–§9). The plan and contract
is `wave-plan-pwa/plan.md` (§1 rulings R1–R18, §3 push decisions, §5 store decisions, §6 app shell, §7 push).
Research lives in `wave-plan-pwa/research/` (PWA) and `wave-plan-pwa/research-stores/` (stores). Per-wave critics:
`critic-w1.md`, `critic-s1.md`, `critic-s2s3.md`, `critic-push.md`.

## Where things stand

| Shipped | Commit |
|---|---|
| Installable web app (manifest, offline-only service worker, kill switch) | `3f05c04` |
| Reviewer-ready web (report everywhere, block holes, /support, /legal/delete-account, review seed) | `c0963b2` |
| Capacitor shell in `mobile/` + web app mode (`src/lib/native/*`), Vibe+ hidden in the app | `9ba375e` |
| Auth pages clear the status bar in the app · "← back" hidden in the app | `fd81dd4`, `6b1369f` |
| Push pipeline (web push + FCM, one outbox) — **DARK** | `d3d38a4` |
| Production builds compile from scratch (Turbopack build cache shipped stale CSS) | `b393cb1` |
| Journal: Session 65 (v7.7) | `55351a9` |

- **Production DB: `20260923090000`, unchanged.** The push migration `20260924120000_push_notifications.sql` is on
  the LOCAL copy only.
- **Push is off.** It needs Franky's four steps (below). No device can register yet anyway: that's wave 3′.
- **The iPhone app** builds and runs in the iOS 26.4.1 simulator. The walk so far: launch, sign-in, sign-up,
  swipe-back, Terms in the in-app browser. Android has never been built (no Android Studio).

## The waves left, in order

### 1. Wave 3′ — push, phone side (NEXT; unblocked)
Write plan.md §8 first (contracts + file ownership), then run the critic, then implement → review → repair, then
integration. Designs: `research/critic.md` wave 3, `research-stores/critic.md` "PWA impact", plan §3 D1/D2 (+ the
2026-09-25 addendum) and §7. Suggested batches:
- **3A Settings card:** a new `src/components/settings/NotificationsCard.tsx` (one entry in SettingsClient's card list).
  It holds the on/off for this device, a switch per kind (all on, D1), "Show message previews" (D2), "install first"
  on iOS Safari, and help when permission is denied. The route whitelists `otto_settings.push = {previews, off[]}`
  (`src/app/api/me/otto/settings/route.ts`). The card knows its route: native push in the app, web push elsewhere.
- **3B Client push library:** `src/lib/pwa/push-client.ts` subscribes inside the tap handler (iOS 18.4+ prefers
  `window.pushManager`), re-syncs on every open and POSTs `/api/me/push-devices`. `src/lib/native/push-native.ts`
  drives `FirebaseMessaging` through `window.Capacitor.Plugins`: requestPermissions, getToken, token refresh, and a
  tap goes to `openFromNative(url)`. `leave-device-clean.ts` deletes the device row, unsubscribes or deletes the
  token, sends SIGNED_OUT to the SW, and clears the `vibe_*_v1` keys and the draft. The badge comes from
  `/api/me/badge` → `setAppBadge`.
- **3C Every sign-out path calls leaveDeviceClean:** SettingsClient, suspended-actions, accept-terms-form,
  verify-school, EmailLinkProblem (a browser-only signOut, so hit DELETE first), OnbHeader, and the school-email
  page. `restrictUser` also drops a banned student's push rows (`src/lib/moderation/actions.ts`).
- **3D Shells:** the iOS AppDelegate adds Firebase + APNs hooks, guarded so the app never crashes without
  `GoogleService-Info.plist`. On Android, google-services stays guarded. Handle notification taps.
- **3E Asks + get-the-app:**
  - The Otto tab: "Get these on your lock screen".
  - After the first DM: "Know when they reply".
  - A "Get Vibe on your phone" card with a QR code to `/get` in desktop onboarding (`public/html/onboarding.html` —
    grep, don't read whole). D3 asked for this.
  - A Campus card after the tour.
  - `public/sw.js` honours `renotify` (bump SW_VERSION), then the payload goes back to one tag per thread.
  - MessagesMobile refetches on `visibilitychange`.

### 2. S3D — link files (BLOCKED: Apple Team ID + Play app-signing SHA-256)
- Add `public/.well-known/apple-app-site-association` and `assetlinks.json`.
- Claim the paths in `research-stores/wrapper-tech.md` §4.3. Exclude `/`, `/legal/*`, `/api/*`, `/html/*`.
- Skip `.well-known` in the proxy matcher. Add a JSON content-type header in next.config for the extensionless file.
- The entitlement (Release) and the Android intent filters already exist.
- **Live by Oct 23** (Android can take 7 days to propagate).

### 3. S4 — submission kit (BLOCKED: store accounts)
- The App Privacy label and the Play Data safety form, from `research-stores/repo-readiness.md` §c (Sentry, Resend,
  Stripe, Supabase, Firebase).
- 18+ age forms. Review notes in the gitignored `handoffs/stores/review-notes.md`.
- Screenshots from LOCAL seeded accounts only.
- The production review seed: `node scripts/seed-review-accounts.mjs --production --i-have-frankys-yes`. Franky runs
  it at his terminal (it asks for the project ref).
- Support URL `/support`; deletion URL `/legal/delete-account`.
- Last safe submission is **Fri Oct 16** for both stores.

### 4. Wave 4 — polish + launch gate
- `/api/version` + a "New version, tap to refresh" toast.
- A runbook in `scripts/pwa/` or `mobile/README.md`, **never `docs/`** (it's the gitignored `DOCS/` on this Mac).
- The journal entry.
- The device checklist (`research/critic.md` I1–I10, P1–P10, A1–A4; `research-stores` N1–N10).
- At launch, open push with `PUSH_ALLOWLIST=*`.

### Security pass (before submitting)
- Both sentinels over everything since Sept 3 (`audit-sentinels` skill).
- The Sept 3 pre-store gate: a pentest of the LOCAL stack only, because Preview shares the production DB.
- Fold in session 65's follow-ups (session file §6 and §8). The main one is a block clause on the
  post_comments / post_reposts / bookmarks insert policies, which needs a migration and Franky's yes.

## Franky's queue (the real critical path)
1. James: how CONNECTVIBE. LLC is registered, and a public business address (the Indiana record lists none).
2. D-U-N-S via developer.apple.com/enroll/duns-lookup (about 11 days). The same number works for Google.
3. A working @connectvibe.app mailbox, plus a real test email to help@.
4. A company Google account → a Firebase project + a Play Console org account ($25).
5. The Apple Developer org enrollment ($99). Decision gate **Oct 9** if Apple hasn't moved.
6. The lawyer, live by about Oct 14: Terms zero tolerance + the 24-hour review line + 18+ + Texas SB 2420. Privacy
   names Sentry, Resend, Stripe, Firebase/APNs.
7. **Turning push on:** (a) yes to the production push migration; (b) a VAPID pair once (never rotate) →
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` on Production only; (c) `FCM_SERVICE_ACCOUNT_B64`
   after Firebase + the APNs key; (d) `PUSH_ENABLED=true`, `PUSH_ALLOWLIST=<founder ids>`.
8. Install Android Studio. Pick a fallback store name with Rylan.

## How to work in this repo now
- **Dev:** preview config `vibe-sw` (NEXT_PUBLIC_SW_DEV=1) against the LOCAL Supabase. **Never `next start`** (it
  reads production). Build locally only with the scratchpad `local-build.mjs` pattern (LOCAL env, no Sentry upload).
- **Local sign-in:** sign out first, then an admin magic link (`/auth/v1/admin/generate_link` on 127.0.0.1 →
  `/auth/confirm?token_hash=…`). Accounts are in the session 63 handoff §5; the review pair comes from
  `scripts/seed-review-accounts.mjs --apply`.
- **iPhone app:**
  - `cd mobile && npx cap sync ios`
  - `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination "platform=iOS Simulator,id=<iPhone 17>" -derivedDataPath ios/DerivedData/Orch CODE_SIGNING_ALLOWED=NO build`
  - then the simulator tool's `launch`.
  - `npm run release:check` before any store build.
- **Checks:** `node scripts/check-pwa.mjs https://www.connectvibe.app` (82 checks). After a CSS change, confirm the
  SERVED stylesheet has it (see memory `project_turbopack_build_cache`).
- **The repo is PUBLIC.** No keys, keystores, Firebase configs, Team IDs or reviewer credentials in commits.
- **Waves:** a plan section → an adversarial plan critic → 4–5 file-owned batches (implement → review → repair) →
  integration → the orchestrator's own gates + a browser/simulator pass → commit + push → a live check. Model split:
  Fable orchestrates, Opus 5.5 builds.

## Roadmap for the Sept 26 founders' meeting (built end of S65, on Fable)

- **The roadmap link is unchanged:** https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi (version 5, "Sept 26 meeting, final"). The
  Sept 21 version stays in the page's history. It is PRIVATE until Franky shares it from the page's Share menu.
- **Source file:** the scratchpad `roadmap.html` (session-specific; if a later session must edit it, `Artifact read` the URL
  and build on what comes back). Research behind it: `handoffs/roadmap-2026-09-25/` (facts, bank + factcheck, ambassadors +
  factcheck, marketing, scaling, podcast-gtm, podcast-product, podcast-map). All gitignored.
- **What it is:** 14 chapters that read as a page and, with the Present button, become full-screen slides (arrow keys,
  Esc exits, the mode is remembered per device). Each chapter animates in once as it arrives; the cover replays only after
  leaving it. Ticks on the task cards are per device (localStorage), not shared — James and Rylan likely have no Claude
  accounts, so no shared `db`.
- **Decisions baked in as recommendations, for the meeting to confirm:** the one sentence ("...clubs, events, and each
  other, all in one place"); the first club = three traits; seven-line charter; one October result per founder; Oct 9 no
  extensions; Mercury bank first; the Founding 10 = officers of signed clubs in October, only after the lawyer answers the
  perks/labor question; no paid ads; Indy first, campus two only after the six-part test.
- **Numbers on the page** are from the live DB on Sept 25 (20 accounts, 14 verified, 1 club, 0 upcoming events, 0 sign-ups
  in 7 days). Franky sends a screenshot of five numbers every Sunday from now on (his call to confirm).

**Version 6 (2026-09-25, later):** Franky's corrections applied. James does NOT own the company — he created the LLC and runs the
paperwork (Franky is probably on the filing too); the page now says "runs the paperwork" everywhere, and the EIN and the bank
application wait until who's named on the LLC is agreed by all three + the lawyer (the "responsible party" on the EIN form is
whoever runs the LLC, not who filed). The "Campus 10" = the most involved students on campus (other companies' ambassadors,
student government, orientation leaders, Greek/cultural leaders, club officers) for IDEAS first (start now) and reach second
(after the lawyer's perks/labor answer). Two product decisions added with recommendations: (1) club pages — an officer creates
it from their own verified account; ≥2 officers; ownership passes at graduation; the club's school email earns the existing
`verified` mark and recovers the page; no shared logins; (2) movable profile widgets built in November as the first post-launch
build — moving/hiding sections FREE, the flair + who-viewed-you stays Vibe+; money model decided in January with real numbers.
Rylan's ten clubs are due at the Oct 23 check (not Oct 31). Text ~4,400 words (was 5,758); reference-only blocks hide in
Present mode. Three-agent review (plain English / facts / cofounder read) folded in. Source file: scratchpad `roadmap3.html`.

**Correction (2026-09-25):** SAE is Franky's own chapter used as a TEST page; no club has actually signed. Roadmap v7 says 0 clubs
signed and makes "sign SAE for real" Rylan's week-1 task (the example page).

**v8 (2026-09-25):** "the code isn't what's slow" line replaced by "Main focus now: the app, the paperwork, and getting the campus
on it" (Franky's wording). Chapter 2 gained a 25-minute pitch workshop for the Sept 26 meeting (write alone → read out →
build from the parts → stress-test with the five hard club questions), plus the five questions we ask a club before showing.
