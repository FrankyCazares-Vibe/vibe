# 3C: every sign-out path (wave 3′ push client)

Read-only map, 2026-09-25. Every line cited is from `main` at 55351a9.

## TL;DR

- **8 live sign-out / leave paths**, all React. **No desktop static-HTML page signs out**
  (grep of `public/html/*.html` + `public/html/_*.js` for signOut / logout / "Sign out" = zero hits).
  Desktop reaches sign-out only through the React `/settings` page (`public/html/profile.html:3141`
  cog, `src/components/LeftNav.tsx:138`).
- **Three shared chokepoints cover 6 of the 8 paths**: `SignOutCard` + `DangerZone` in
  `SettingsClient.tsx`, and `useLeaveAccount` in `suspended-actions.tsx` (used by
  `/account/suspended`, `/auth/school-email`, phone onboarding `OnbHeader`).
- **Two paths are browser-only `scope: "local"` sign-outs** (no server route):
  `verify-school/page.tsx:235` and `EmailLinkProblem.tsx:75`. The row DELETE must go before `signOut`:
  `DELETE /api/me/push-devices` returns 401 without a session (`push-devices/route.ts:182-185`).
- The server already does its part: `/api/auth/logout` deletes **all** of the user's rows plus the
  `push_address` row; account deletion cascades. `restrictUser` does **not** touch `push_devices`,
  but the dispatcher already skips restricted recipients (`src/lib/push/dispatch.ts:608`).

## 1. Path inventory

| # | Where (file:line) | Kind | Calls | Before / after | Reachable |
|---|---|---|---|---|---|
| A | `src/components/settings/SettingsClient.tsx:1170-1192` `SignOutCard.onSignOut` (button :1211) | React | `vibeRequest("/api/auth/logout", {method:"POST"})` :1176-1179, **no body** | Fails → stay put :1180-1185. OK → `clearDraft()` :1190, `window.location.href="/auth/login"` :1191 | Both. `/settings` is one React page (`src/app/settings/page.tsx:4`). Phone: `ProfileMobile.tsx:1580`. Desktop: `LeftNav.tsx:138`, `profile.html:3141`, `admin-shell.tsx:454` |
| B | `SettingsClient.tsx:1241-1263` `DangerZone.onDelete` | React | `fetch("/api/me",{method:"DELETE", body:{confirm_handle}})` :1246-1250 | Fails → error, stay. OK → `clearDraft()` :1258, `location.href=AFTER_DELETE` (`/auth/signup`) :1259 | Both, same as A |
| C | `src/app/account/suspended/suspended-actions.tsx:156-187` `useLeaveAccount().signOut` | React hook | `fetch("/api/auth/logout",{POST, JSON header, no body})` :162-165 | Fails → `SIGN_OUT_FAILED`, stay :171-180. OK → `clearDraft()` :185, `location.href="/auth/login"` :186 | Via C1-C3 below |
| C1 | `SuspendedActions` :262-276 on `src/app/account/suspended/page.tsx:369` | React | hook C | as C | Both (proxy sends every page a restricted student asks for here) |
| C2 | `SuspendedActions` on `src/app/auth/school-email/page.tsx:735` (only when `userId`) | React | hook C | as C | Both |
| C3 | `src/components/mobile/onboarding/OnbHeader.tsx:102-130` `AccountSheet` ("⋯" sheet) | React | hook C | as C | **Phone only** (`OnboardingMobile.tsx:1087`). Desktop onboarding is `public/html/onboarding.html` in an iframe, which has no sign-out |
| D | `suspended-actions.tsx:189-216` `useLeaveAccount().deleteAccount` | React hook | `fetch("/api/me",{DELETE, body:{confirm_handle}})` :194-199 | OK → `clearDraft()` :211, `location.href=AFTER_DELETE` :212 | Same three hosts as C1-C3 (sheet delete button `OnbHeader.tsx:216`) |
| E | `src/app/auth/terms/accept-terms-form.tsx:80-94` `onSignOut` (button :177) | React | `fetch("/api/auth/logout",{POST, JSON header, no body})` :82-85, **errors swallowed** :86-88 | **Always** `clearDraft()` :92, `location.href="/auth/login"` :93, even on failure | Both (`/auth/terms`). Its "delete your account" link goes to `/settings#delete-account` :173, which is path B |
| F | `src/app/auth/verify-school/page.tsx:229-254` `onSignOutAndSignIn` (403 "different account" card, button :322-330) | React | **browser-only** `getSupabaseBrowserClient().auth.signOut({scope:"local"})` :235-237 | Error → message, stay. OK → `location.assign(loginHref)` :246 (login with `?next=` back to this link) | Both (email link) |
| G | `src/components/auth/EmailLinkProblem.tsx:65-88` `useSignOutHere` ("Not you? Sign out") | React hook | **browser-only** `auth.signOut({scope:"local"})` :75-77 | **No navigation**. OK → `onSignedOut()`, so the card flips to `SignedOutCard` / `signedOutProblem`. Fail → `SIGN_OUT_FAILED` | Both. Used by `SignedInByLinkCard` :248 (button :287) and `EmailLinkProblemCard` :336 (button :446). Those render on `src/app/auth/confirm/page.tsx:272,283` and `src/app/auth/callback/page.tsx:268,279` |

Server-side `signOut` calls (not client paths): `src/app/api/auth/logout/route.ts:86`, `src/app/api/me/route.ts:151` (after delete).
Not sign-outs: the `src/proxy.ts` hits are comments plus the exempt list :176-179. The `public/journal` hits are prose.
No `onAuthStateChange` sign-out handler exists except school-email's session watcher (`school-email/page.tsx:239`), which only updates UI.

## 2. `POST /api/auth/logout` today (`src/app/api/auth/logout/route.ts`)

- :16-24 `optionalBody`: empty, oversized (>8192, :9) or broken JSON → null. It never 400s.
- :74-82 reads `userId` via `supabase.auth.getUser()`. A failure leaves it null and doesn't block sign-out.
- :84 → `forgetPushDevices(userId, addressFromBody(body,"push_address"))` :45-60. It runs with the service
  client (:48). It deletes `push_devices where user_id = userId` (:50) **and** `where address = push_address`
  (:51), whoever owns that row. Errors are logged by code only; a missing table warns once (:54).
- :86 `supabase.auth.signOut()`. Scope is the default **global**, so it also ends the account's other devices' sessions (comment :30-34).
- :87 always `{ ok: true }`.
- **No current caller sends `push_address`.** A, C and E post no body.
- `addressFromBody` (`src/lib/push/device-address.ts:258-263`) accepts any non-empty string ≤2048.

## 3. Moderation: `src/lib/moderation/actions.ts` `restrictUser` (:330-418)

- Service client: `const service = createSupabaseServiceClient()` :338 (import :8).
- Steps: read the account :339-348 → insert the restriction :370-384 (the enforcing step) → `mirrorToAuth` :399
  → `clearAuthBan` :408 → for a ban, `stopVibePlusForBan` :411-413 → return :415.
- **It does not touch `push_devices` today.** Grep shows the table is used only in the logout route,
  `api/me/push-devices`, `lib/push/{device-address,dispatch,config.test}` and the migration.
- It does not sign the student out either: sign-in stays open on purpose (header :33-50).
- It is already covered at send time. The dispatcher loads active restrictions (`dispatch.ts:456-473`, set at :536)
  and skips with `recipient_restricted` (:608) or `actor_restricted` (:609). A restricted student can't re-register:
  the proxy lets only `DELETE /api/me/push-devices` through (`src/proxy.ts:179`), and POST refuses
  `account_restricted` (`push-devices/route.ts:33`).
- **Where the belt-and-braces delete would go:** after :408 and before the ban block, reusing `service`:
  `await service.from("push_devices").delete().eq("user_id", args.userId)`, with the logout route's
  `isMissingPushSchema` / log-by-code handling (`logout/route.ts:52-58`). Keep it **non-fatal and out of
  `RestrictionStep`** (:89): adding a step widens a union the admin UI branches on. `liftRestriction` (:452) needs
  nothing, because devices re-register on the next open.

## 4. Account deletion: `DELETE /api/me` (`src/app/api/me/route.ts`)

- The order is Stripe stop (:109-111), then file purge (:115-132), then `admin.auth.admin.deleteUser(user.id)` (:137),
  then `supabase.auth.signOut()` (:151).
- It does not delete `push_devices` itself. It doesn't need to, because the cascade covers it:
  `auth.users` → `public.users.id REFERENCES auth.users (id) ON DELETE CASCADE`
  (`supabase/migrations/20260430190000_phase1_initial_schema.sql:12`) → `push_devices.user_id ... REFERENCES
  public.users (id) ON DELETE CASCADE` (`20260924120000_push_notifications.sql:462`).
  `push_outbox.recipient_id` cascades the same way (:514).
- The **browser subscription / FCM token survives** the deletion. With no row, nothing gets sent to it. A later sign-in on
  that browser re-registers it (POST upserts by address, `push-devices/route.ts:29-30,166`).

## 5. Desktop static HTML

- **No shared desktop sign-out exists, so there is nothing to edit there.** `public/html` has no sign-out control.
  Desktop users sign out only on React `/settings` (path A/B), so editing A/B/C covers desktop.
- The SW **is** registered from static pages. `<script src="/html/_sw.js" defer>` is at `profile.html:18`,
  `messages.html:14` and `onboarding.html:14`. It registers `/sw.js` scope `/` on `www.connectvibe.app` only
  (`_sw.js:81,86-88`). Inside the store app it **unregisters** every SW instead (`_sw.js:75-79`), so the store-app path is FCM-only.
  React pages register through `<ServiceWorkerRegistrar />` (`src/app/layout.tsx:71`,
  `src/components/pwa/ServiceWorkerRegistrar.tsx:12`).
- If a static-page sign-out is ever added, it would need a plain-JS twin of `leaveDeviceClean`, like `_sw.js`
  twins the registrar. `profile.html` and `_persistence.js` hold per-account localStorage (see gotcha 6).

## 6. Does a signed-out browser still get pushes?

**Yes, if the server sends to it.** The `push` handler in `public/sw.js:148-184` has no session or auth check.
It shows whatever payload arrives, and must, because a silent push gets the permission revoked (:144).
**So the server-side row delete is what actually stops notifications.** Unsubscribing locally
(`PushSubscription.unsubscribe()` / FCM `deleteToken`) is the second guard. A dead endpoint then comes back
`gone` (`send-webpush.ts:185,190`; FCM `send-fcm.ts:259`). The SW's `SIGNED_OUT` handler (`sw.js:271-275`) only runs
`deleteCachesExceptOffline()`. It doesn't clear the badge or close shown notifications.

## 7. Minimal change per path

Assumed helper shape (3A/3B own it): `leaveDeviceClean(opts?: { server?: boolean }) → Promise<string | null>`.
1. Read this device's address (web: `reg.pushManager.getSubscription()?.endpoint`; app: the stored FCM token).
2. If `server !== false`, `DELETE /api/me/push-devices {address}` (needs a live session).
3. Unsubscribe / delete the token.
4. `postMessage({type:"SIGNED_OUT"})` to the SW, clear caches, clear per-device localStorage.
5. Return the address. It never throws or blocks.

| Path | Change |
|---|---|
| A `SettingsClient.tsx:1176` | `const addr = await leaveDeviceClean();` before `vibeRequest`. Add `json: { push_address: addr }` (vibeRequest supports `json`, `src/lib/feedback/request.ts:24-27`). Keep :1190-1191 |
| C `suspended-actions.tsx:162` (covers C1/C2/C3) | Same: `const addr = await leaveDeviceClean();` before the fetch. Add `body: JSON.stringify({ push_address: addr })` (the header is already JSON, :164). Keep :185-186 |
| E `accept-terms-form.tsx:82` | Same as C. It already navigates even on failure (:92-93), so the local wipe is right either way |
| F `verify-school/page.tsx:235` | **`await leaveDeviceClean()` before `auth.signOut({scope:"local"})`**. The DELETE needs the session that `signOut` ends. Keep `scope:"local"`: do **not** switch to `/api/auth/logout`, which is global and would sign out the account's other devices |
| G `EmailLinkProblem.tsx:75` | Same as F, before `signOut` at :75. There is no navigation (the card flips in place), so the helper must not reload the page |
| B `SettingsClient.tsx:1258` | After `res.ok`, `await leaveDeviceClean({ server: false })` before `clearDraft()`. The row is already gone by cascade, and the session is dead (`me/route.ts:151`), so a DELETE would 401 |
| D `suspended-actions.tsx:211` | Same as B, before `clearDraft()` |
| `restrictUser` `actions.ts:408` | Optional non-fatal `push_devices` delete by `user_id` (§3) |

This is 7 client edits in 5 files. C covers three screens in one edit. The store app runs the same React pages in its WebView, so these edits cover it too.

## Gotchas / open questions

1. **Order for A/C/E.** If `leaveDeviceClean()` runs before the logout call and the call then fails (A and C stay put),
   the student is still signed in but unsubscribed on this device. They stay that way until the next open re-registers.
   The alternative for these three paths:
   - Read the address first.
   - POST logout with `push_address`. The route deletes server-side, including all of the user's rows.
   - On OK, call `leaveDeviceClean({ server: false })`.

   This saves a request and avoids that state. **Recommend the alternative.** It needs the helper to expose a
   separate `currentPushAddress()`. F and G have no route, so they must DELETE first.
2. **The helper must never block sign-out.** DELETE has a 30/h limit (`push-devices/route.ts:48`), `pushManager` can stall,
   and some browsers throw on `navigator.serviceWorker` (`_sw.js:34-37`). Wrap every step and cap the whole thing at ~3 s.
   The helper must not navigate itself (G doesn't navigate).
3. **Scope.** DELETE removes only the caller's own row (`push-devices/route.ts:197-203`). If this browser's row belongs
   to a third account, only the local unsubscribe kills it. The next send then comes back `gone`.
4. **The SW may be absent.** It registers only on `www.connectvibe.app` or `NEXT_PUBLIC_SW_DEV` (`_sw.js:81`,
   `layout.tsx:68-70`) and is unregistered in the store app (`_sw.js:75-79`). `navigator.serviceWorker.controller` is
   null after a hard reload. Post `SIGNED_OUT` via `(await getRegistration())?.active` and no-op when absent.
5. **The store app has no FCM plumbing yet.** `package.json` has no firebase or Capacitor push plugin, and `src/` has no
   `deleteToken`. The app half of the helper is 3A/3B's dependency, and until then it is a no-op.
6. **Per-account localStorage survives sign-out today.** `clearDraft()` clears only `vibe_onb_draft_v1:*`
   (`draft.ts:50,298-316`). These account-bearing keys are not cleared:
   - `vibe_user_v1`: written at `profile-html-bridge.tsx:93`, read at `profile.html:44` and `_otto.js:24`.
   - `vibe_posts_v1`, `vibe_vibes_v1`, `vibe_relationships_v1`: `_persistence.js:11-16`.
   - `vibe_recent_searches_v1`: `campus-home.tsx:4590`.
   - `vibe_cal_events_v1`: `profile.html:7309`, `messages.html:1689`.

   The device-level keys can probably stay: the tour-seen flags, `vibe_tour_pending`
   (`use-mobile-tour.ts:66`), and `vibe.launchUrlHandled` (`NativeBridge.tsx:27`).
   Use an explicit list, not `localStorage.clear()`. Clearing everything would replay the tours.
7. **The SW's `SIGNED_OUT` only deletes caches** (`sw.js:271-275`). Notifications already on screen and the app badge
   stay, so the last student's "Name: text" remains on a shared phone. Consider `getNotifications()` → `close()` and
   `setAppBadge(0)` in that handler. That is an sw.js edit, so bump `SW_VERSION` (`sw.js:6,25`).
8. **Account switch without sign-out.** Examples: login "Continue", or a magic link opened in a browser holding another
   session. No sign-out path runs. The row stays under the old account until the new session re-registers (upsert by
   address, `push-devices/route.ts:29-30,166`). 3A must register on every signed-in open.
9. **Open question.** E's "delete your account" goes to `/settings#delete-account` (`accept-terms-form.tsx:173`). Can a
   `terms_required` student load `/settings`? `src/lib/auth/campus-access.ts:41` redirects to `/auth/terms`. That's not
   verified for `/settings`. If it redirects, path B is a loop from there, but that's outside push.
10. **Open question.** Should the §3 `restrictUser` delete also run on suspensions, not only bans? The dispatcher skip
    covers both already. Deleting means a lifted suspension gets pushes only after the student reopens the app.
    Recommend: bans only, or skip it entirely and rely on `dispatch.ts:608`.
