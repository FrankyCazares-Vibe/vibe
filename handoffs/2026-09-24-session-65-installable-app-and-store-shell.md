# Session 65 — The installable app, the store decision, and the native shell

**Date:** 2026-09-24 · **Continues:** session 64 · **Started at:** `9c0e645` · **Model:** Opus 5.5 orchestrating, Opus workers

> **Picking this up? Start with `2026-09-25-session-65-next-waves.md`** — the remaining waves, what blocks them, and Franky's queue.

Read this first. The plan and contract is `handoffs/wave-plan-pwa/plan.md` (§1 rulings R1–R18, §2 wave 1, §3 push
decisions, §4 S1, §5 store decisions, §6 S2+S3). Research: `wave-plan-pwa/research/` (PWA) and
`wave-plan-pwa/research-stores/` (store route). Critics per wave: `critic-w1.md`, `critic-s1.md`, `critic-s2s3.md`.

---

## §1 — What happened, in plain English

1. **Vibe installs to a phone's home screen** (wave 1, live). It opens full screen at Campus, shows a branded
   "You're offline" page without signal, and keeps nothing personal on the phone. A kill switch exists and was
   rehearsed.
2. **Franky decided the installable app means real App Store and Google Play apps** ("and more" became: only
   those two). The web app stays the fallback if Apple is late.
3. **The web app is ready for store review** (S1, live): Report on events and club posts, reported posts leave the
   reporter's feed, blocked people can't comment/save/repost, no dead-end screen for unverified accounts, public
   /support and /legal/delete-account pages, the footer names CONNECTVIBE. LLC, and a script builds the two
   App Review demo accounts.
4. **The native app shell exists** (S3, committed): a Capacitor 8.5.2 project in `mobile/` that loads the live site.
   **The website knows when it's inside the app** (S2, live): no Vibe+ selling in the app, native link and Back
   handling, and fixes for things that break in an app window.
5. **Not yet seen running:** the iPhone app (this Mac has no iOS Simulator platform) and any Android build (no
   Android Studio).

## §2 — What shipped (every Vercel build green)

| Commit | What |
|---|---|
| `3f05c04` | Wave 1: manifest, icons, `public/sw.js` (offline page only), kill switch `scripts/pwa/sw-killswitch.js`, proxy skip, headers, static pages, standalone copy fixes, `scripts/check-pwa.mjs` (82 checks, green live). |
| `c0963b2` | S1: report everywhere + hide on report, block holes (404 like the like routes), dead ends, /support, /legal/delete-account, landing footer + env-gated store badges, `/get`, review-account seed, Sentry handle scrub. |
| `9ba375e` | S2+S3: `mobile/` Capacitor shell (iOS + Android), `src/lib/native/*` app mode, NativeBridge, store-safe Vibe+, web-view hazards, `/` and `/get` send app users to /campus. |

**Production database: unchanged, still `20260923090000`.** No migration this session.

## §3 — Decisions (Franky, 2026-09-24)

- Push: every kind on by default; name + message text on the lock screen (with a hide switch). I kept two
  exceptions unless he overrules: stranger message requests show no text; private-club invites don't name the club.
- Install: landing-page button → the stores; desktop onboarding tells students they can get Vibe on their phone.
- Test push on the live site, founders only (`PUSH_ENABLED` + allowlist).
- Vibe+ invisible in both store apps at launch. 18+ on both stores. Only App Store + Google Play.
- Franky enrolls with Apple himself after asking James how the LLC is registered (single/multi-member, whose name).
- Orchestrator defaults he hasn't overruled: Capacitor on both stores, FCM for app push + web push for browsers,
  `mobile/` in this repo, permanent id `app.connectvibe.vibe`.
- Model: he asked Opus 5.5 vs Fable; recommended Fable orchestrating + Opus 5.5 workers (the S59 split).

## §4 — Open for Franky (the critical path is paperwork)

1. James: how the LLC is registered; a public business address (the Indiana record lists none).
2. D-U-N-S via developer.apple.com/enroll/duns-lookup (up to ~11 days; same number for Google Play).
3. A working @connectvibe.app mailbox; a real test email to help@ (never proven to deliver).
4. Company Google account → Firebase project + Play Console org account ($25).
5. Apple Developer enrollment ($99/yr) once D-U-N-S lands. Decision gate Oct 9 if Apple hasn't moved.
6. Lawyer (via James), live before ~Oct 14: Terms zero-tolerance + 24-hour review (today they say "no guarantee
   about response time"), 18+, Texas SB 2420; Privacy names Sentry, Resend, Stripe, Firebase/APNs.
7. Install the iOS Simulator platform (Xcode ▸ Settings ▸ Components, several GB) and Android Studio.
8. iPhone test of the installed WEB app: install from Safari, use Safari and the app for 1h+, report any sign-out
   (shared refresh token after the iOS cookie copy — research/critic.md I2). Not an issue for the store app.
9. Pick a fallback store name with Rylan ("Vibe" is probably taken).

## §5 — Next engineering, in order

1. **Push wave 2′**, transport-agnostic: `push_devices` (webpush | fcm), outbox + trigger, send-time safety checks,
   `send-webpush.ts` + `send-fcm.ts`, payload per plan R13 (web) and FCM data (app). Local migration first;
   production only with Franky's yes. Designs: `research/critic.md` wave 2 + `research-stores/critic.md` §PWA impact.
2. **Simulator/emulator pass** once the platforms are installed: launch at /campus, swipe-back, links, offline.
3. **S3D** link files (`.well-known/apple-app-site-association`, `assetlinks.json`) once the Team ID and Play
   SHA-256 exist — live by Oct 23.
4. **S4** submission kit: privacy label, Data safety, 18+ forms, review notes (gitignored `handoffs/stores/`),
   screenshots from LOCAL seeded accounts, the review seed on production (Franky's yes).
5. Both sentinels + the pre-store security gate (pentest the LOCAL stack; Preview shares the production DB).

## §6 — Follow-ups found this session (not done)

- RLS insert policies on `post_comments`, `post_reposts`, bookmarks lack a block clause (direct REST writes cross a
  block) — needs a migration.
- `GET /api/posts/[id]` has no block check; the club page shows posts by an officer the viewer blocked.
- Account deletion leaves `auth.audit_log_entries` (email, IP); `moderation_actions.meta.handle` is kept forever.
- `/support` redirects a suspended student to the notice; LegalLayout's footer says hello@ and has no Support link.
- Repost has no rate limit; Unblock doesn't clear a hidden DM channel; the feed hides only the 100 newest reports.
- Android Back with a sheet open goes back in history (nothing listens for `vibe:native-back` yet).
- `mobile/` npm audit: 7 vulnerabilities, all through `@capacitor/assets` (dev-only tooling).
- The Play feature graphic (1024×500) and the ic_stat_vibe generator aren't scripted yet.
- Privacy page's "backups up to 30 days" is unverified against the Supabase plan.

## §7 — Lessons

- **Run `tsc` on anything the orchestrator writes**, tests included: `detect.test.ts` passed `node --test` but its
  literal `./detect.ts` import (TS5097) would have broken the Vercel build. Use the variable-specifier import.
- **iOS Capacitor 8.5.2 exits at launch unless `<bundle>/public/<appStartPath>` exists**, even with `server.url`
  (`CAPBridgeViewController.swift:172`). `mobile/www/campus/index.html` exists for that; `release:check` asserts it.
- **`docs/` is the gitignored `DOCS/` on this Mac** (case-insensitive APFS + `core.ignorecase`). Never put a
  deliverable there — it silently won't commit. The kill switch lives in `scripts/pwa/`.
- **The repo is PUBLIC** (`FrankyCazares-Vibe/vibe`). Reviewer credentials and review notes live in the gitignored
  `handoffs/stores/`; `mobile/` key patterns were ignored before the folder existed.
- **The browser pane's scaling breaks coordinate clicks** at emulated phone width; click through JS. A pane resize
  clears the emulated viewport mid-test.
- **Sign in to local test accounts with an admin-generated magic link** (`/auth/v1/admin/generate_link` on
  127.0.0.1 → `/auth/confirm?token_hash=…`), after signing out — never type a password into the browser.
- A plan critic ran `xcrun simctl list runtimes`, which printed CoreSimulator "Install Started … Succeeded" (a
  self-update of the simulator service, not a runtime). Tell agents not to run `simctl`.

---

## §8 — Continued 2026-09-24/25: the iPhone app runs, and push is built (dark)

**Shipped (Vercel green):**

| Commit | What |
|---|---|
| `fd81dd4` | Sign-in pages clear the iPhone status bar inside the store app (seen in the first simulator run). |
| `d3d38a4` | Push wave 2′: one pipeline for Web Push + FCM (plan §7, critic-push.md). DARK: nothing sends until `PUSH_ENABLED=true` + keys + `PUSH_ALLOWLIST` on Vercel Production. |

**iPhone simulator:** the iOS 26.4.1 Simulator platform was downloaded with Franky's yes (8.46 GB). The app BUILDS
(first full build: storyboards, icon, launch screen), installs, and opens the live site at /campus → sign-in. The
Claude simulator panel refuses with "Xcode is installed but not selected" although `xcode-select -p` already prints
`/Applications/Xcode.app/Contents/Developer`; Franky was asked to run
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` so taps work. Until then: build with xcodebuild
(`-derivedDataPath mobile/ios/DerivedData/Orch`), `xcrun simctl install/launch`, `xcrun simctl io … screenshot`.

**Push wave 2′ as built:** migration `20260924120000_push_notifications.sql` (push_devices, push_outbox, trigger,
claim_push_outbox) — **applied LOCALLY only; production needs Franky's yes**, after this code is live (it is), with
the file header's pre-flight + management-API recipe, gated on predecessor `20260923090000`. 139 unit tests; a
24-scenario local end-to-end harness with fake senders (scratchpad `e2e/`). Franky's third lock-screen rule
(2026-09-25): strangers' comments and mentions show the name, not the words.

**To turn push on (Franky, in order):** (1) yes to the production migration; (2) VAPID pair once
(`npx web-push generate-vapid-keys`) → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Sensitive),
`VAPID_SUBJECT=mailto:help@connectvibe.app` on Production only, never rotate; (3) Firebase project + APNs key upload
→ `FCM_SERVICE_ACCOUNT_B64` (a service account with only the FCM Admin role) on Production only; (4)
`PUSH_ENABLED=true`, `PUSH_ALLOWLIST=<founder ids>`. Nothing registers devices until wave 3′ (the client).

**Next engineering:** wave 3′ — the client side of push (web subscribe in the installed web app, native FCM
registration in the shells, the Settings Notifications card, `leaveDeviceClean` on every sign-out path, the
contextual asks, and `public/sw.js` honouring `renotify` so chat returns to one tag per thread). Then S3D link files,
S4 submission kit, the sentinels.

**Follow-ups from the push wave (minor, not done):** send-fcm doesn't drain response bodies (keep-alive sockets);
`pushSiteOrigin` trusts any `next dev` run (only PUSH_ENABLED keeps it off locally; `.env.local` points at
production); logout deletes a named push_address even without a session (documented, low risk); re-claimed rows skip
the rate limiters; `capText` can split a flag emoji; the orgs page bundle now pulls push code via membership.ts;
the dead `connection` kind is still counted by both the Otto count and the badge. From the simulator: the login
"← back" goes / → /campus → login inside the app (pointless there).

---

## §9 — Simulator walk, and a stale production build found and fixed (2026-09-25)

- Franky ran `sudo xcode-select -s …` (the panel needs `/var/db/xcode_select_link`, which didn't exist). The live
  simulator panel works. Walked signed out on the live site: launch → /campus → sign-in; "Create an account" opens
  in the app; **swipe-back works**; the Terms link opens in the in-app browser sheet (SFSafariViewController) with the
  app intact underneath; "← back" looped (/ → /campus → sign-in), so `6b1369f` hides `.vibe-auth-back` under
  `html.vibe-app`.
- **That CSS never reached production**: Vercel's build reused stale Turbopack output (Next 16.3 defaults
  `turbopackFileSystemCacheForBuild: true`; Vercel restores `.next/cache`). Proven with two local immutable-mode
  builds (names are content hashes; the local build had the rule). **Fixed in `b393cb1`** (build cache off); the fresh
  build shipped `0nylwvwq3dvoj.css` with the rule and the pill is gone in the app. Memory:
  `project_turbopack_build_cache.md`. Any deploy since the cache began may have been partly stale; b393cb1 rebuilt all.
- Not walked yet (needs a signed-in account or a device): the offline page in the app, Android anything, links opening
  the app (S3D), share sheets, .ics export.

---

## §10 — Session close (2026-09-25)

- **Shipped after §8/§9:** `55351a9` journal Session 65 (v7.7; header, versions list and next steps brought current —
  the next-steps list had still described the world before moderation). Every Vercel build green all session.
- **§1 item 5 is out of date:** the iPhone app now builds and runs in the iOS 26.4.1 simulator (walked signed out: launch,
  sign-in, sign-up, swipe-back, Terms in the in-app sheet). Android is still unbuilt.
- **The founders' roadmap** (same link, version 8) was rebuilt for the Sept 26 meeting on Fable, then corrected by Franky
  three times: James runs the paperwork (not the company); SAE is a test page (zero clubs signed); the Campus 10 are the
  most involved students for ideas first; "slow" wording replaced by "main focus now: the app, the paperwork, and getting
  the campus on it"; a 25-minute pitch workshop added. Source: `handoffs/roadmap-2026-09-25/roadmap-v8.html`.
- **Production DB still `20260923090000`.** Nothing was applied to production this session.
- **Next session starts at** `2026-09-25-session-65-next-waves.md` → "START HERE — session 66".
