# Wave 3′ (push on the student's side): plan critic

**In plain English.** The plan is sound in shape: no blockers. The weak spot is the "resync on every open" logic,
which the plan names but never writes down. As written, it can silently switch off a student's notifications,
whether from a Supabase hiccup, an offline launch or the PUSH_ENABLED kill switch, and in one rare case keep the last
student's messages going to a shared phone. Rulings 1–3 pin the table down. The store apps also keep the previous
student's notifications on screen after sign-out (the plan only cleans that up for browsers). One import mistake would
break the production build. Everything else is small. Counts: 0 BLOCKER, 7 MAJOR, 19 MINOR.

Session 66 · 2026-09-25 · read-only pass over `main` 55351a9 plus the orchestrator's uncommitted plugin install
(`mobile/package.json`, `CapApp-SPM/Package.swift`, `Package.resolved`). Checked against: plan.md §1–§8, critic-push.md,
the five w3-maps, `src/lib/push/*`, the device + logout routes, `public/sw.js`, `src/lib/native/*`, NativeBridge, the
registrar, `src/proxy.ts`, and the installed `@capacitor-firebase/messaging` 8.5.2 (definitions.d.ts, iOS
`ios/Plugin/*.swift`, Android `android/src/main/java/**`) and `@capacitor/ios|android` 8.5.2 (`CAPPlugin.m`,
`Plugin.java`). Where this file and plan §8 disagree, the RULING is the contract unless the orchestrator overrules it.
`FM/` = `mobile/node_modules/@capacitor-firebase/messaging/`.

---

1. **B — MAJOR — the resync table is the heart of W5/W6 and it is not written down; three natural readings of it
   silently turn a student's notifications off.**
   **Evidence:** §8.2 names the outcomes (`none|post|rebuild|evict|forget`) and says "exhaustively tested", but gives
   no rows. W5 lists "session expired" as an evict trigger. But the GET answers 401 whenever `getUser()` errors, a
   GoTrue blip included (`push-devices/route.ts:79-86`, the same helper the GET will use), and a DELETE after a 401 is
   impossible. A failed `getToken` (offline launch, APNs token late: `FM/ios/Plugin/FirebaseMessaging.swift:64-73`) or
   a timed-out `getRegistration`/`getSubscription` reads as "no token", which leads to "forget". Forget drops the record.
   Once there is no record, native resync never calls `getToken` again (W6), so this device can never be evicted. If
   the DELETE also failed offline, the row lives on under the old owner for up to 60 days (`payload.ts:530`), and the
   next person to sign in on that phone gets them. Separately, a `tokenReceived` (Android rotation mid-session) is
   swallowed by "at most one resync per page load", so the server keeps a dead token until the next full load, which
   can be days in the app.
   **RULING (contract for `resyncAction` + `resyncDevicePush`):**
   - Inputs:
     - `rec`: the parsed record, or null.
     - `cur`: `{k:"some",address} | {k:"none"} | {k:"unknown"}`. Web: "none" only when EVERY pushManager checked
       resolved null; any rejection, timeout or missing registration is "unknown". Native: "some" or "unknown", never
       "none".
     - `srv`: `{k:"ok",user,available,devices} | {k:"signed-out"} | {k:"error"}`.
     - `now`.
   - Rows, first match wins:
     1. `rec` null and `cur` none: **none**, with no GET. Native with `rec` null: **none**, with no `getToken` and no
        GET.
     2. `cur` unknown: **none**.
     3. `srv` signed-out (401): **none**. Never evict or forget on a 401. The real session-ending paths already clear
        the server: logout deletes every row (`logout/route.ts:50`), account deletion cascades, and batch D's
        `restrictUser` deletes.
     4. `srv` error: **none**. Only a 429 or 5xx sets `vibe_push_sync_fail_v1`. Status 0 (network or abort, e.g. a
        notification tap navigating away mid-request) does NOT start the 10-minute backoff.
     5. `rec.user !== srv.user`: **evict**:
        - DELETE `rec.address`, plus `cur.address` if it is different, whoever owns them;
        - web: unsubscribe. App: `deleteToken`;
        - clear shown notifications (item 4);
        - drop the record.
     6. `rec` null, `cur` some, and `hash(cur)` in `devices`: **rebuild**.
     7. `rec` null, `cur` some, and not in `devices`: **evict** (web only: DELETE `cur.address`, then unsubscribe).
     8. `rec.user === srv.user` and `cur` none (web): **forget**: a quiet DELETE of `rec.address`, then drop the
        record.
     9. `srv.available === false`: **none**. Never POST, never unsubscribe (item 2).
     10. `cur.address !== rec.address`: **post** the new address, then a quiet DELETE of `rec.address` (a restored
         backup or a rotated token must not leave the old row alive).
     11. `hash(cur)` not in `devices`:
         - if `now - rec.at < 24 h` (the sender just deleted it as gone): web **resubscribes** (unsubscribe, then
           subscribe; permission is already granted, so there is no prompt), then posts. Native: **none**;
         - otherwise **post**.
     12. `now - rec.at > 7 d`: **post**.
     13. Otherwise: **none**.
   - A resync POST that is refused (`push_unavailable`, `terms_required`, `account_restricted`, `wrong_origin`) ends as
     **none**. It keeps the subscription and the record. Only `turnOnDevicePush` unsubscribes on `push_unavailable`.
   - `resyncDevicePush(opts?: {reason?: "load" | "token"})`: "token" (from `tokenReceived`) skips the once-per-load gate,
     but not the backoff.
   - `device-push.ts` runs turnOn, turnOff, resync and leave one at a time on a single promise chain. A resync that
     started before a turnOn or turnOff re-reads the record before any write, and stops if it changed. Otherwise a
     resync that read "subscription, no record" mid-turnOn evicts the student's own new device.
   - `readDevicePush` returns `on` only when the permission is granted, `cur` is some, a record exists and
     `rec.user === srv.user`. A record naming another user reads as `off`, so B never sees A's device as "on".
   - One GET per page load is shared by `readDevicePush` and resync: an in-memory promise, dropped after any write.
   - The pure test covers every row above. Include: 401 with a record, a 429 versus status 0, `cur` unknown with a
     record, and available false with a record.

2. **B — MAJOR — the kill switch and the allowlist would wipe founders' devices.**
   **Evidence:** §8.2 returns `devices: []` whenever `available` is false. With a record present, that reads as "hash
   not in devices", so resync POSTs. The POST spends the 20/h bucket before the gate (`route.ts:141` before `:148`) and
   answers 403 `push_unavailable`. §8.2's only stated reaction to that code is turnOn's "unsubscribe/deleteToken →
   hidden". A shared POST helper would therefore unsubscribe every founder device on its first open after
   `PUSH_ENABLED=false`. Turning push back on would then reach nobody: the rows exist, the endpoints are dead, and each
   send answers 410. With the record missing, `[]` also makes W5 evict the student's own row. `available` is also true
   while the table is missing in production (code ships first; §7 2A applied it locally only), so turnOn meets a 503.
   **RULING:**
   - GET: `devices` is listed whenever the table exists, whatever `available` says.
   - `available = pushAllowedFor(uid) && tableExists`.
   - `readDevicePush` returns `hidden` when `!available`, when web and `!webpush_key`, or when in the app and `!fcm`.
   - Resync never POSTs while `available` is false (item 1, row 9).

3. **A — MAJOR — one import from the card would break the production build.**
   **Evidence:** §8.2 calls `@/lib/push/payload` "pure", and A needs the nine kinds for "What to send". But payload.ts
   imports `createHash` from `node:crypto` (`payload.ts:40`) and the word-list filter (`:42` →
   `text-filter-list`). A value import from payload.ts into NotificationsCard.tsx or notifications-card-view.ts puts
   `node:crypto` in a client bundle, and that fails `next build`. None of the §8.5 gates (tsc, eslint, node --test)
   would catch it.
   **RULING:**
   - Client modules (anything a `"use client"` file imports) take only `import type` from `src/lib/push/*`. The two
     exceptions are `device-address.ts` and `config.ts`, which import nothing.
   - The card's kind list lives in `notifications-card-view.ts` as a literal typed `readonly PushKind[]`.
   - Its node test imports `PUSH_KINDS` from payload.ts (fine under node) and asserts the two lists hold the same
     kinds.
   - `settings/page.tsx` and the settings route (both server-side) may import payload.ts.

4. **B + C — MAJOR (lock-screen privacy) — the store apps keep the last student's notifications after sign-out.**
   **Evidence:**
   - W9 closes shown notifications "so a shared phone must not keep the last student's lock screen", but only in
     `sw.js`. The store apps are the main route (D3) and have no service worker (`ServiceWorkerRegistrar.tsx:58-61`).
   - leaveDeviceClean's steps (§8.2) never clear delivered native notifications. On a shared phone, "Name: message
     text" (D2) stays in Notification Center after Sign out, Delete account and a W5 evict.
   - The plugin can clear them on both platforms, unguarded:
     - `removeAllDeliveredNotifications` (FM definitions.d.ts);
     - iOS: `FirebaseMessagingPlugin.swift:142-145`;
     - Android: `FirebaseMessagingPlugin.java:217-226`.
   **RULING:**
   - `push-native.ts` (C) adds `nativeClearDelivered(): Promise<void>`, which never throws.
   - `leaveDeviceClean` (B) calls it in the app, right after `deleteToken`.
   - The web half of the same step is the W9 `SIGNED_OUT` message.
   - Resync's **evict** (item 1, row 5) runs this same step on both web and app.

5. **A — MAJOR — mentions quietly get two keys again, and Otto's "Ping on mentions" stops working.**
   **Evidence:**
   - §8.2 builds `pushPrefs.off` with `parsePushPrefs`, which ADDS "mention" to `off` when `mention_pings === false`
     (`payload.ts:263`).
   - After a reload, the card's full-list `push.off` save (W4) for any other switch writes "mention" into
     `push.off`.
   - From then on, Otto's toggle (`OttoSettings.tsx:62`, which writes `mention_pings` only) shows ON while mention
     pushes stay off. Only the Settings switch can undo it.
   **RULING:**
   - The page passes `off` without "mention", and `mentionPings = mention_pings !== false && !rawOff.includes("mention")`.
   - The card never puts "mention" in `off`.
   - The PATCH route drops "mention" from any incoming `push.off`, the same way it drops unknown kinds (W4), so
     `mention_pings` really is the one key (W3).

6. **Orchestrator — MAJOR — the store-app icon badge never clears, and it survives sign-out.**
   **Evidence:**
   - Every FCM push sets `aps.badge` to the unread total (`payload.ts` toFcm, apns block).
   - The plugin has no badge API (the definitions list none), and W10 defers a native badge to wave 4.
   - So the iPhone app icon keeps the last pushed count after the student reads everything, and after sign-out it
     shows the previous student's count. Founders testing will read that as "push is broken".
   - `payload.ts` is off-limits in 3′a (§8.3).
   **RULING:** before the founders' iPhone pass, the orchestrator picks one:
   - (a) a ≤5-line payload.ts edit that leaves out `apns.payload.aps.badge` until wave 4. The test pins it. Web
     `app_badge` stays;
   - (b) accept a stale count and add it to the device-pass notes and the Franky summary.

   Recommend (a).

7. **B — MAJOR — the subscribe call is under-specified, and read literally it fails in every browser.**
   **Evidence:**
   - §8.2 pins `applicationServerKey` but not `userVisibleOnly: true`. Chrome and WebKit both reject a subscribe
     without it (`research/web-ios.md:199`, `:321`; `web-android-push.md:212`).
   - `getRegistration("/")` can return a registration whose worker is still installing (`active === null`), and
     `registration.pushManager.subscribe` rejects without an active worker. The registrar only registers after `load`
     (`ServiceWorkerRegistrar.tsx:99-100`), so a first-visit tap lands in that gap.
   **RULING:**
   - `subscribe({ userVisibleOnly: true, applicationServerKey })` everywhere.
   - Use the registration only when `reg.active` is set. Otherwise race `navigator.serviceWorker.ready` against the
     4-second timeout.
   - `window.pushManager` (iOS 18.4+, Safari 18.5+ on the Mac) needs no worker.
   - A timeout is `{ok:false, status:{kind:"off"}, message:"Try again in a moment."}`, never "unsupported".

---

**MINOR**

8. **B — W8 in sw.js.** Order and failure handling, so the one-notification rule always holds:
   - Parse the tag with `^dm:([^:]+):[^:]+$`, and build the prefix WITH its trailing colon.
   - Close first, then show, as the plan says. Never show first and then close the others: two pushes for one thread
     could then close each other and leave nothing on screen.
   - Wrap the close step (`getNotifications().then(close).catch(()=>{})`) so it can never reject, block or skip the
     show. `showNotification` is the handler's last step, and the existing default fallback (`sw.js:175-180`) stays.
   - Known and accepted: two chat pushes that race can leave the OLDER message showing.

9. **B — GET route details.**
   - No Origin or Content-Type check: browsers don't send `Origin` on a same-origin GET, so reusing
     `isAllowedRegistrationRequest` would hide the card forever.
   - Answer with `Cache-Control: private, no-store`. The `user` field drives W5, and a cached answer from the
     previous account would stop the evict.
   - The hash is lowercase hex of SHA-256 over the address's UTF-8 bytes, first 16 characters, on both sides.
     `addressHash` returns null where `crypto.subtle` is missing (insecure LAN dev origin), and the caller treats that
     as `cur` unknown.

10. **B — turnOn failures.**
    - Any POST failure unsubscribes only a subscription THIS call created, and writes no record.
    - 403 `push_unavailable` or 503 → `hidden`.
    - 429 → the route's message.
    - `terms_required` → failure-copy.
    - App: keep the token and write no record.
    - iOS: when `getToken` fails right after the prompt (APNs token not there yet,
      `FirebaseMessaging.swift:64-73`), the one 1.5-second retry stays. The answer is a "try again" message, never
      `unsupported`.

11. **C + orchestrator — W11's "no Firebase contact before a student opts in" only holds until the first opt-in.**
    - `getToken` sets auto-init on for good (`FirebaseMessaging.swift:65`, `FirebaseMessaging.java:28`), and the
      plugin has no call to turn it off again.
    - After that, the SDK checks in with Firebase on every launch, even after Turn off or Sign out. With `deleteToken`
      done, it mints a fresh token at the next launch.
    - The iOS plugin also calls `registerForRemoteNotifications()` on every launch once the plist is bundled
      (`FirebaseMessaging.swift:23`). That talks to Apple and shows no prompt.
    - **RULING:**
      - Say this in the README "Push" section and in the Franky summary.
      - Resync never calls `deleteToken` except on evict.
      - `turnOffDevicePush` keeps `deleteToken`.

12. **C — the iOS cold-start tap is unverified.**
    - With the scene lifecycle, Capacitor sets the notification delegate at scene connect, after
      `didFinishLaunching` (3D map §2, §6).
    - **RULING:** add "cold-start tap on iOS" to the DEFERRED device pass. Keep the SceneDelegate
      `connectionOptions.notificationResponse` fallback (3D map §6) ready, but don't write it until a device shows a
      lost tap. The tap dedupe covers any double delivery.

13. **C — events that are held forever.**
    - `notificationReceived` (every foreground push) and `apnsTokenReceived` (every launch) are sent "retain until
      consumed" (`FirebaseMessagingPlugin.swift:214`, `:249`; `FirebaseMessagingPlugin.java:341`).
    - Nothing listens, so each one sits in a per-event array for the life of the app process (`CAPPlugin.m`
      notifyListeners; `Plugin.java:671-678`).
    - **RULING:** on every load, NativeBridge also attaches no-op listeners for both events.

14. **C — W12 taps.**
    - Act only when `actionId === "tap"`. iOS forwards "dismiss" and custom ids too (`FirebaseMessagingPlugin.swift:228-234`).
    - Send the path through the existing `openFromNative` guards (`NativeBridge.tsx:42-50`), so a tap for the page
      already showing does nothing.
    - Write the dedupe id to storage BEFORE `location.assign`.

15. **B — keep the tap dedupe through sign-out.**
    - Android re-delivers the original launch intent when the Activity is re-created (3D map §6).
    - If sign-out clears `vibe_push_taps_v1`, the previous student's tap replays onto the login screen with that
      thread's `?next=`.
    - **RULING:** drop `vibe_push_taps_v1` from leaveDeviceClean's list. It holds message ids only.

16. **C + device pass — Android 12 and older always answers "granted".**
    - On Android below 13, `checkPermissions` returns "granted" even when the student switched the app's notifications
      off in system settings (`FirebaseMessagingPlugin.java:93-101`). The card can then say "on" while nothing shows.
    - **RULING:** W14's Android line always mentions system settings. Add an Android 12 device to the DEFERRED pass.

17. **C — the Run Script phase and the pbxproj edit.**
    - Keep `ENABLE_USER_SCRIPT_SANDBOXING = NO`, and add `alwaysOutOfDate = 1`.
    - `cp` into `${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/` works for Archive too (it follows the
      product symlink). `${TARGET_BUILD_DIR}` is the more direct equivalent.
    - README: never drag `GoogleService-Info.plist` into Xcode. That adds a Resources reference to the pbxproj, and
      every clone without the file then fails the build (3D map §4 a).
    - Gate: `plutil -lint` on `project.pbxproj` and `Info.plist` (it reads without building).
    - Optional: `release:check` also asserts that the generated `capacitor.config.json` carries
      `plugins.FirebaseMessaging`.

18. **Orchestrator — the privacy label.**
    - `Package.resolved` now pins `googleappmeasurement` and `google-ads-on-device-conversion-ios-sdk` (from the
      orchestrator's uncommitted diff).
    - They are resolved, not linked: the plugin links only FirebaseCore and FirebaseMessaging (`FM/Package.swift`
      targets).
    - **RULING:**
      - DEFERRED: confirm on the first archive that no GoogleAppMeasurement is inside `App.app`.
      - Generate Xcode's privacy report.
      - Declare the FCM token / installation ID ("Device ID", App Functionality, not tracking) on the App Store label
        and in Play's Data safety form.

19. **Orchestrator — each batch's tsc gate hits the others' new files.**
    - B imports `push-native.ts` (C). C imports `device-push.ts` (B). A and D import `leave-device-clean.ts` and
      `device-push.ts` (B). All of them are new files.
    - **RULING:** before the wave, commit stub files with the exact §8.2 signatures (bodies that return a safe
      default). The owning batch replaces them. Otherwise, TS2307 on those three paths is expected and each batch
      reports it.

20. **B + C — which module may import which.**
    - `leave-device-clean.ts` → `device-push.ts` → `push-native.ts` → `bridge.ts`, one way only.
    - `device-push.ts` never imports `leave-device-clean`, NativeBridge or React.
    - `actions.ts` (D, server) imports only `@/lib/push/config`.
    - `device-push-logic.ts` takes `Platform` by `import type`.

21. **B — where leaveDeviceClean gets the address.**
    - The address comes from the record, or else (web) from the live subscription's endpoint. Native reads it only
      from the record: `getToken` at sign-out would mint a token.
    - Order: server DELETE (only when `serverDelete`) → unsubscribe / `deleteToken` → clear shown notifications
      (`SIGNED_OUT` plus item 4) → badge → storage → `clearDraft`.

22. **D — accept-terms-form.**
    - It navigates to `/auth/login` even when logout fails (`accept-terms-form.tsx:86-93`).
    - **RULING:** on that failure branch, run `leaveDeviceClean({serverDelete:true})` before navigating. The student
      thinks they have signed out.

23. **A — the card.**
    - Each switch gets:
      - its accessible name from the row label (`aria-labelledby`);
      - `aria-describedby` pointing at the hint;
      - `aria-disabled` + `aria-busy` while busy.
    - The result text goes in an `aria-live="polite"` node.
    - The card renders late (W2), so `/settings#notifications` never scrolls. Scroll once when the card first appears
      if `location.hash === "#notifications"`.

24. **B — when the registrar runs resync.**
    - Run the one `resyncDevicePush()` after the `register()` attempt SETTLES, success or failure, on allowed hosts.
    - On iOS 18.4+ the subscription can live on `window.pushManager` without a worker, so a failed register must not
      skip W5's evict.

25. **B — W10 and W9 details.**
    - The badge refresh also needs `Notification.permission === "granted"`, since WebKit refuses `setAppBadge`
      without it. Stop quietly on a 401.
    - W9's `SIGNED_OUT` also goes out on a resync evict (item 4).

26. **3′b (for the planner) — one message per platform.**
    - In an Android browser tab, the 3′a card offers web push while E's ask offers "Get the app".
    - Decide one message per platform before 3′b. Recommend: the store app wins once the Play URL is set.

---

**Checked and sound**

- **W3 grep.** `mention_pings` is read only by Otto's own route and UI and by `payload.ts:263`.
- **W4.** Dropping unknown kinds and merging `push` one level deep matches `parsePushPrefs`.
- **W5 any-owner DELETE.**
  - Holding the endpoint or token is the capability. The logout route already deletes that way (`logout/route.ts:51`).
  - A cross-site DELETE needs a CORS preflight, so CSRF can't reach it.
  - The answer is still `{ok:true}`.
  - The `devices` hashes are the caller's own, and 64 bits can't be reversed.
- **W7 order.**
  - The logout route deletes rows before `signOut` (`route.ts:84-86`).
  - F and G must DELETE before the local sign-out.
  - The restricted proxy lets GET and the DELETE through (`proxy.ts:175-181`, `:239-248`).
  - Every sign-out call site found by grep is in the 3C map.
- **iOS gesture.** Starting the prompt before the first `await` is right. WebKit's gesture rule applies to prompting,
  so subscribing after a grant works. DEFERRED on a device.
- **W8.** A new tag always alerts again in Chrome, Edge and Firefox. With the item 8 order, at least one notification
  always shows.
- **W11.**
  - The plugin configures Firebase itself, behind the plist guard (`FirebaseMessaging.swift:16-21`), so AppDelegate
    needs no Firebase import.
  - The Info.plist and manifest auto-init keys are right.
  - `presentationOptions` is read from the synced config (`FirebaseMessagingPlugin.swift:264-272`), so
    `npx cap copy` is the right step.
- **W12.**
  - Plugin `"FirebaseMessaging"` and the events `tokenReceived` / `notificationActionPerformed` match
    `listenNative`.
  - Held events go to the FIRST listener (`CAPPlugin.m` sendRetainedArgumentsForEvent, `Plugin.java:716-727`).
  - iOS `data` = userInfo (`FirebaseMessagingHelper.swift:9`). Android tap `id` = `google.message_id`
    (`FirebaseMessagingHelper.java:56-58`).
- **No import cycles** as specified. The pure-module and variable-specifier rules match the house tests.

**DEFERRED additions** (on top of §8.5):
- the iOS cold-start tap;
- whether iOS 18.4+ declarative notifications show up in `getNotifications()` (W9);
- Android 12 permission reads;
- no GoogleAppMeasurement in the archive;
- a Debug iPhone build has no `aps-environment` (3D map §2), so the founders' iPhone pass needs a Release build or
  TestFlight.


---

## Orchestrator decisions (2026-09-25, before 3′a starts)

- **Every ruling above stands** and overrides plan §8 for the batch it names.
- **Item 6 → (a), done by the orchestrator:** `toFcm` no longer sets `aps.badge` (payload.ts + payload.test.ts, 34/34
  pass). Web `app_badge` unchanged.
- **Item 19 → stubs written (uncommitted):** `src/lib/pwa/device-push.ts`, `src/lib/pwa/leave-device-clean.ts`,
  `src/lib/native/push-native.ts` hold the exact signatures, with `resyncDevicePush(opts?: {reason?: "load"|"token"})`
  (item 1) and `nativeClearDelivered()` (item 4). `npx tsc --noEmit -p .` is clean with them. B replaces the first two
  files, C the third — keep every exported name and signature (add, don't rename).
- **Item 26 → decided in 3′b.**
- `@capacitor-firebase/messaging` 8.5.2 is installed and synced; Firebase iOS SDK 12.19.2 resolved; a Debug simulator
  build with the plugin succeeded, and `App.debug.dylib` links FirebaseMessaging with no AppMeasurement symbols.
