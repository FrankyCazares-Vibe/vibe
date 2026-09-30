# 3A map — Settings "Notifications" card + preference storage

Read-only map, 2026-09-25, against `main` @ 55351a9. Every claim cites `file:line`.
All paths are relative to `/Users/franciscocazares/vibe`.

## 1. `src/components/settings/SettingsClient.tsx` (1642 lines, `"use client"` at :1)

### 1.1 Declaring and ordering the cards: no list or array
- The only export is `export function SettingsClient({ profile, campus })` (:60-67). Props:
  `profile: Profile` (type :25-39) and `campus: SettingsCampusInput | null` (:66).
- The cards are written straight into the JSX at :116-127, in this order:
  1. `<AccountCard profile={profile} />` :116 (fn :438)
  2. `<CampusCard initial={campus} />` :117 (fn :524, `id="campus"` :658)
  3. `<HandleCard currentHandle handleChangedAt />` :118-121 (fn :871)
  4. `<CampusTourCard handle={profile.handle} />` :122 (fn :132-192)
  5. `<BlockedUsersCard />` :123 (fn :204-315)
  6. `<HelpAndSafetyCard />` :124 (fn :1447, `id="help-safety"` :1450)
  7. `<SignOutCard />` :125 (fn :1170-1230)
  8. `<DangerZone handle={profile.handle} />` :126 (fn :1232-1439, `id="delete-account"` :1268)
  9. `<LegalFooter />` :127 (fn :1548-1573)
- Page header (:78-114): eyebrow "Settings" (:90), h1 "Account" (:102), subtitle
  "Manage your account, sign out, or delete everything." (:112). Neither the subtitle nor the
  page metadata (`src/app/settings/page.tsx:11-14`, "Account, sign out, and account deletion")
  mentions notifications.
- **The "Campus tour" card** (`CampusTourCard` :132-192) is the simplest card to copy:
  `<section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>` (:156) +
  `<SectionTitle>` (:157) + a description `<p>` (:158-168, DM Sans 13.5, `#5C5853`, lh 1.55)
  + an orange pill button (:169-189). It writes only to localStorage (:138-145) and then
  goes to `window.location.assign(dest)` (:152), picking phone or desktop with
  `window.matchMedia(max-width: MOBILE_BREAKPOINT_PX - 1)` (:150).
- Where a Notifications card would go: anywhere in :116-127. The shape to copy for a card
  with an anchor: `id="…"` + `scrollMarginTop: 24` (CampusCard :658, HelpAndSafetyCard :1450-1451).

### 1.2 Shared chrome (all module-private; nothing but `SettingsClient` is exported)
- `const PAGE_BG` :41-44 (cream radial gradients).
- `const CARD_GLASS: React.CSSProperties` :46-58. **Not exported.** It holds the background
  gradient, `backdropFilter: "blur(28px) saturate(180%)"` plus the Webkit copy, border
  `1px solid rgba(255,255,255,0.7)`, `borderRadius: 18` and a 3-part box shadow. Every card
  spreads it and adds `padding: 22, marginBottom: 16` (:156, :252, :440, :1195, :1270-1272).
  DangerZone overrides the border to `1px solid rgba(220,60,60,0.30)` (:1273).
- `function SectionTitle({ children })` :1575-1590. **Not exported.** It is an `<h2>`:
  Fraunces 22/800, `#1C1C1E`, letterSpacing `-0.01em`, margin `0 0 14px`.
- `function Row({ label, value, hint? })` :1592-1642. **Not exported.** It is a label/value
  pair for a 2-column grid (`gridTemplateColumns: "140px 1fr"`, :442). Label: DM Sans 12/700
  uppercase, `#8A8580` (:1603-1615). Value: DM Sans 14, `#1C1C1E` (:1617-1626). Hint:
  12, `#8A8580` (:1627-1638). It is read-only, with no control slot.
- `function HelpLink({ href, label, hint, external? })` :1489-1546 is a bordered row
  (quoted in §5).
- The card description paragraph (house style): DM Sans 14, `#5C5853`, margin `0 0 14px`,
  maxWidth 440 or 520, lineHeight 1.5 (:1197-1208 Sign out; :254-263 Blocked users).
- Buttons: the orange primary pill (:172-186, `#FF5C35` bg, `#FAF7F2` text, 13/700, radius 999,
  padding `10px 18px`) and the neutral secondary pill (:1213-1224: border
  `rgba(28,28,30,0.14)`, bg `rgba(28,28,30,0.04)`, 14/700).
- On phones the page padding comes from `.vibe-settings-main` (:70), `src/app/globals.css:2831-2839`
  (`@media (max-width: 760px)`: `calc(20px + env(safe-area-inset-top)) 14px 32px`). So the card
  content width at 375px is about 375 − 28 − 44 = 303px.

### 1.3 Toggles, switches, toasts, feedback
- **There is no toggle or switch in this file** (it has no `role="switch"`, no checkbox, no `aria-checked`).
- **This file never imports a toast helper.** Feedback goes through:
  - `vibeRequest` (import :12; `src/lib/feedback/request.ts:138`). It shows an error toast on
    failure unless `quiet: true`, and an optional `success` info toast (`request.ts:24-35`,
    `:115-117`, `:175`). Options: `json?` (it stringifies the body and sets the content-type),
    `failure` (required), `success?`, `quiet?`. It returns
    `VibeResult<T> = {ok:true,status,data} | VibeFailure{ok:false,status,code,error,message,action?,field?}`
    (`request.ts:37-53`).
  - `LoadFailed` / `asLoadFailure` (import :7-11) for an inline read failure with Retry
    (BlockedUsersCard :268-275). The loading state is plain "Loading…" (:276-285).
  - The raw toast API, if needed: `toast(input: string | ToastInput)` at `src/lib/feedback/toast.ts:51`
    (`ToastTone = "info" | "error"`, :14).
- The mapped failure copy already handles `403 terms_required` and `403 account_restricted`
  (`src/lib/feedback/failure-copy.ts:124`, `:146`).

### 1.4 Otto settings: SettingsClient neither loads nor saves them
- Nothing in the file references `/api/me/otto` or `otto_settings`.
- The server page does not read the column either. The select at `src/app/settings/page.tsx:32-34`
  is `id,email,name,handle,handle_changed_at,school,school_email,school_verified,school_system,campus_id,campus_set_at,otto_answers,year,major,created_at`,
  so it has **no `otto_settings`**. That read uses the service role (`page.tsx:30`), so adding the
  column is only a change to that string.

### 1.5 Sign out (`SignOutCard` :1170-1230)
```ts
const onSignOut = async () => {                       // :1173
  if (busy) return; setBusy(true);                    // :1174-1175
  const r = await vibeRequest("/api/auth/logout", {   // :1176
    method: "POST",
    failure: "Couldn't sign you out. Try again.",     // :1178  (NO body today)
  });
  if (!r.ok) { setBusy(false); return; }              // :1180-1185 stay put on failure
  clearDraft();                                       // :1190 (src/lib/onboarding/draft)
  window.location.href = "/auth/login";               // :1191 hard navigation
};
```
- Server: `POST` `src/app/api/auth/logout/route.ts:71-88`. It already accepts an optional body
  `{ push_address }` (:67-69, :84, parsed by `addressFromBody(body, "push_address")`
  `src/lib/push/device-address.ts:258-263`). It deletes **every** `push_devices` row of the user
  and the row with that address (`forgetPushDevices` :45-60) BEFORE `supabase.auth.signOut()` (:86),
  and it always answers `{ok:true}` (:87). A broken, empty or oversized body counts as no body (:16-24).
- The body is the one gap: this call sends none, so the device's own row is only caught by the `user_id`
  delete (:50). A shared device registered to someone else is not caught. Wave 3′ adds
  `json: { push_address }` plus the SW `SIGNED_OUT` message (`public/sw.js:268-272` expects it
  from a `leaveDeviceClean` helper that **does not exist in src yet**; see plan.md R15, :29).
- Other sign-out callers that wave 3′ must keep consistent:
  - `src/app/account/suspended/suspended-actions.tsx:156-178` (raw fetch, JSON header, no body)
  - `src/app/auth/terms/accept-terms-form.tsx:80-92` (raw fetch, best-effort)
  - browser-only `auth.signOut` (bypasses the route): `src/app/auth/verify-school/page.tsx:235`
    and `src/components/auth/EmailLinkProblem.tsx:69-75`. critic-push.md:315-318 notes these must
    hit the DELETE route first.

### 1.6 Delete account (`DangerZone` :1232-1439)
- `onDelete` :1241-1264 is a raw `fetch("/api/me", { method:"DELETE", headers JSON, body:
  JSON.stringify({ confirm_handle: confirm }) })` (:1246-1250), not `vibeRequest`. An error sets
  inline `error` (:1253, :1261, rendered :1373-1383). On success it runs `clearDraft()` (:1258) and then
  `window.location.href = AFTER_DELETE` (:1259), where `AFTER_DELETE = "/auth/signup"`
  (`src/app/account/suspended/suspended-actions.tsx:38`).
- The button is enabled only when the typed handle matches (:1238-1239, :1389).
- Server: `DELETE` `src/app/api/me/route.ts:58`. It stops billing, purges uploads, then
  `admin.auth.admin.deleteUser(user.id)` (:136-137) and `supabase.auth.signOut()` (:151).
  The route has **no push code** (grep "push" is empty). The `push_devices` rows go through the FK:
  `user_id uuid not null references public.users (id) on delete cascade`
  (`supabase/migrations/20260924120000_push_notifications.sql:462`). The browser's
  PushSubscription or FCM token itself stays on the device (see Gotchas).
- The suspended page has its own delete path: `suspended-actions.tsx:196-212`, the same
  `AFTER_DELETE` redirect.

### 1.7 Who mounts it: phone AND desktop, one component
- The only mount is `src/app/settings/page.tsx:67-83` (`src/app/settings/` holds only `page.tsx`).
  It is a server component with an auth redirect (:21-23), wrapped in
  `<CampusAppShell>`.
- `CampusAppShell` (`src/components/campus-app-shell.tsx:33-50`) renders `LeftNav` + children +
  `MobileTabBar` + `OttoCorner`. Below 900px the CSS collapses it (doc :26-31). Settings has **no**
  `*Switch.tsx` mobile/desktop fork, unlike `src/app/otto/OttoSwitch.tsx:18-19` (`useIsMobile`).
  So the same `SettingsClient` serves phone, desktop and the store-app web view.
  `MOBILE_BREAKPOINT_PX = 900` (`src/lib/use-is-mobile.ts:14`).
- There is **no desktop static settings page**. `public/html/` holds only `messages.html`,
  `onboarding.html`, `profile.html` + `_*.js`. `public/html/profile.html:3140-3141` is just a cog
  linking to `/settings`.
- Entry points: `src/components/LeftNav.tsx:138` (`href: "/settings"`),
  `src/components/mobile/ProfileMobile.tsx:1580` (cog), `public/html/profile.html:3141`, and
  `/settings#campus` deep links (`CampusConfirmBanner.tsx:137,142`, `MapMobile.tsx:423`).
- **Restricted (suspended or banned) students never reach /settings.** `restrictedPageAllowed`
  (`src/proxy.ts:145-157`) allows only `/account/suspended`, `/legal/*` and two auth pages.

## 2. `src/app/api/me/otto/settings/route.ts` (109 lines, `PATCH` only)

- The whitelist type `PatchableSettings` :18-26: `chattiness?`, `rsvp_day_before?`, `mention_pings?`,
  `milestone_pings?`, `daily_summary?`, `summary_time?`, `unanswered_dm_pings?`. **No `push`.**
- `sanitizePatch(raw)` :28-57:
  - a non-object gives `{error:"Body must be an object"}` (:29)
  - `chattiness` must be in `VALID_CHATTINESS` (:15, :34-37)
  - the 5 booleans must be `typeof v === "boolean"`, else `Invalid <k>` (:38-45)
  - `summary_time` must match `TIME_RE = /^\d{2}:\d{2}$/` (:16, :46-49)
  - **an unknown key is silently dropped** (:50-53). So a `{push:{…}}` sent to today's route
    gives `{ok:true, settings:null, noop:true}` (:79-81), which looks like success and saves nothing.
- Auth: `supabase.auth.getUser()` → 401 `{ok:false,error:"Unauthorized"}` (:60-67). A bad JSON
  body → 400 (:69-74). A validation error → 400 `{ok:false,error}` (:75-78).
- Guards: **no rate limit, no terms gate and no restriction check in the route.** The proxy
  403s restricted writes with `code:"account_restricted"` (`src/proxy.ts:239-245`). This route is not in
  `restrictedApiAllowed` (`src/proxy.ts:175-181`). Compare `push-devices` POST, which rate-limits
  and gates on terms (`src/app/api/me/push-devices/route.ts:31-34`, :141, :145).
- Merge: a service-role read (:85-90), then **a SHALLOW spread**:
  `const next = { ...(cur.data?.otto_settings ?? {}), ...patch };` (:95). The comment at :10 says
  "deep-merge", but the code is shallow. The read-modify-write is not atomic: two concurrent PATCHes can lose one.
- Write: `.update({ otto_settings: next }).eq("id", user.id).select("otto_settings").single()`
  (:97-102). 500 `Could not load settings` (:93) or `Could not save settings` (:105).
- Response: `{ ok: true, settings: data.otto_settings }` (:108). This is the **raw full blob**,
  including any `push` key. `otto_settings` is not self-writable by the client
  (`src/lib/profile/self-write-columns.test.ts:81`), so this route is the only way to write it.

### 2.1 What a nested `push: { previews?: boolean, off?: string[] }` needs (sketch)
`src/lib/push/payload.ts` is pure (no `server-only`, no `@/` imports; doc :5-9), so the route can
import `PUSH_KINDS` / `type PushKind` from it (`@/lib/push/payload`).
```ts
import { PUSH_KINDS, type PushKind } from "@/lib/push/payload";
const KIND_SET = new Set<string>(PUSH_KINDS);
type PushPatch = { previews?: boolean; off?: PushKind[] };
type PatchableSettings = { /* …existing… */ push?: PushPatch };

// in sanitizePatch's switch:
case "push": {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { error: "Invalid push" };
  const p = v as Record<string, unknown>; const outPush: PushPatch = {};
  for (const [pk, pv] of Object.entries(p)) {
    if (pk === "previews") { if (typeof pv !== "boolean") return { error: "Invalid push.previews" }; outPush.previews = pv; }
    else if (pk === "off") {
      if (!Array.isArray(pv) || pv.length > PUSH_KINDS.length) return { error: "Invalid push.off" };
      const kinds = new Set<PushKind>();
      for (const k of pv) { if (typeof k !== "string" || !KIND_SET.has(k)) return { error: "Invalid push.off" }; kinds.add(k as PushKind); }
      outPush.off = [...kinds];            // deduped, full replacement list
    } // unknown sub-keys dropped, same policy as :50-53
  }
  if (Object.keys(outPush).length) out.push = outPush;
  break;
}

// replacing :95 — keep the shallow merge for flat keys, nest ONE level for push:
const curS = isObj(cur.data?.otto_settings) ? cur.data!.otto_settings : {};
const next = { ...curS, ...patch };
if (patch.push) next.push = { ...(isObj(curS.push) ? curS.push : {}), ...patch.push };
```
Contract choices the planner must pin down:
- `off` is either a **full replacement list** (the sketch above; the client sends the complete off-set
  on each flush) or add/remove ops. Replacement is simplest and matches `parsePushPrefs`'s
  reader. The cost is last-writer-wins across two open tabs.
- Unknown kinds: the sketch 400s. The reader ignores them (`payload.ts:260-262`), so dropping instead
  of 400 is also safe and more forward-compatible (a newer client adds a kind before the server
  knows it).

## 3. `src/components/otto/OttoSettings.tsx` (208 lines)

- Props `{ settings: OttoSettings }` (:10-12). The type is imported from `@/app/api/me/otto/route` (:5).
- Toggles `TOGGLES` :60-66:
  - `rsvp_day_before` "Ping me about RSVPs the day before" (:61)
  - **`mention_pings` "Ping on mentions"** (:62)
  - `milestone_pings` "Ping on like milestones (10 / 50 / 100)" (:63)
  - `daily_summary` "Daily summary at 9 AM" (:64)
  - `unanswered_dm_pings` "Ping on unanswered DMs >24h" (:65)
- **Read path:** the prop comes from `GET /api/me/otto` (`src/app/api/me/otto/route.ts:158`).
  That route reads `otto_settings` with the service role (:173-177) and passes it through
  `mergeSettings` (:139-156). `mergeSettings` returns ONLY the 7 known keys with defaults
  `DEFAULT_SETTINGS` :36-44 (`mention_pings: true` :39), so it **strips `push`**. The type
  `OttoSettings` (:46-54) has no `push`.
- **Write path:** `setKey` (:148-151) → `queuePatch` (:142-146, a 350ms debounce at :145) → `flush`
  (:113-140) → `vibeRequest("/api/me/otto/settings", { method:"PATCH", json: body,
  failure:"Couldn't save your Otto settings." })` (:121-125). A failure rolls back to
  `lastConfirmedRef` (:133-137). It sends **only the changed keys**, so the server's shallow merge
  leaves a stored `push` alone.
- **Presets:** `PRESETS` :26-58. All three set `mention_pings: true` (:39, :46, :53).
  `applyPreset` (:153-158) sends them, so **tapping any chattiness preset turns mention pings
  back on**.
- The UI is a native `<input type="checkbox">` in `<label>` (:192-200), styled dark by
  `.otto-room-toggle` (`src/app/globals.css:2309-2353`: 16px square box, `#ff5c35` when checked,
  light-on-dark text). It is not a switch and does not fit the cream Settings page. The segmented chattiness
  control is `role="radiogroup"` / `role="radio"` + `aria-checked` (:167-181).
- It is mounted in `src/components/otto/OttoPageClient.tsx:250` (desktop) and
  `src/components/mobile/OttoMobile.tsx:391` (phone).
- The other four toggles are **not read by any push code** (grep of `src/lib/push` for
  `milestone_pings|rsvp_day_before|unanswered_dm_pings` is empty). Only `mention_pings` crosses
  over, through `parsePushPrefs` (§4).

## 4. How preferences are read at send time

### 4.1 `src/lib/push/payload.ts` (605 lines, pure)
- `export type PushKind` :48-57 and `export const PUSH_KINDS: readonly PushKind[]` :59-69, in this order:
  `follow, like, comment, mention, org_invite, org_request_approved, dm, group_message, message_request`.
  The dead `connection` kind never pushes (:47; dispatch skips it at `dispatch.ts:588`).
- `export type PushPrefs = { previews: boolean; off: ReadonlySet<PushKind> }` :245.
- `export function parsePushPrefs(ottoSettings: unknown): PushPrefs` :256-265:
  ```ts
  const settings = isObject(ottoSettings) ? ottoSettings : {};
  const push = isObject(settings.push) ? settings.push : {};           // non-object → defaults
  const off = new Set<PushKind>();
  if (Array.isArray(push.off)) for (const k of push.off)
    if (typeof k === "string" && KIND_SET.has(k)) off.add(k as PushKind); // unknown ignored
  if (settings.mention_pings === false) off.add("mention");            // critic item 26
  return { previews: push.previews !== false, off };                  // previews default ON
  ```
  `isObject` (:271-273) rejects arrays. The defaults are every kind on and previews on (plan.md D1, :66).
- `export function pushKindOn(prefs, kind)` :267-269 returns `!prefs.off.has(kind)`.
- `PushBuildContext.previews` :218-219 ("otto_settings.push.previews").

### 4.2 `src/lib/push/dispatch.ts` (925 lines, server-only)
- The recipient row is read with `otto_settings` (`readIn<UserRow>(… "id, name, handle, otto_settings, …")`
  :466; `UserRow.otto_settings: unknown` :279).
- `decide()` :572-652 runs the shared gates first: stale, `pushAllowedFor`, self, consent, restricted,
  blocked, muted (:597-613). **After** those, it parses the prefs:
  `const prefs = parsePushPrefs(recipient.otto_settings);` (:618). Then
  `ready(kind, event, channelId?)` (:619-622) returns `skip("kind_off")` when `!pushKindOn(prefs, kind)`,
  else `{go:true, …, previews: prefs.previews}`.
- `previews` reaches the copy at `buildPushMessage(go.event, { origin, previews: go.previews, badge: null })` (:845).
- Where each kind comes from:
  - The notification rows `NOTIFICATION_KINDS` (:563-565) give follow (:629), like (:634), comment (:638),
    mention (:646, via `decideMention` :727), and org_invite / org_request_approved (:650).
  - Messages come through `decideMessage` (:674). A club channel is skipped (:687). A non-accepted member gets
    **`message_request`** (:703-708). A dm channel gets **`dm`** (:710-711). Everything else is
    **`group_message`** (:713).
  - Mentions: a club-chat @mention is kind `mention` (:749). A post mention is kind `mention` (:756). A DM or
    group @mention is skipped as `covered_by_message` (:720, :742). **So the "Mentions" switch never
    silences a DM; the "Direct messages" switch does.**

### 4.3 Kinds → suggested student-facing switch labels (what each push says, and what previews change)
| PushKind | Suggested label | Lock-screen body (payload.ts) | Previews OFF changes |
|---|---|---|---|
| `follow` | New followers | "Started following you" :333 | nothing |
| `like` | Likes | "Liked your post" :336 | nothing |
| `comment` | Comments | "Commented: <text>" if previews and you follow them, else "Commented on your post" :338-348 | text hidden |
| `mention` | Mentions (posts and club chats) | post :350-359, club chat :360-373 | text hidden |
| `org_invite` | Club invites | "Invited you to join <club>" / "Sent you a club invite" :375-388 | club name hidden |
| `org_request_approved` | Club approvals ("Your club requests") | "Approved your request to join <club>" / "…club request" :384 | club name hidden |
| `dm` | Direct messages | text / "Sent a photo" / "Sent you a message" (`chatLine` :295-303, :390-400) | "Sent you a message" |
| `group_message` | Group chats | title = group name, body "Name: text" (:401-413) | title = sender, "Sent a message in a group chat" |
| `message_request` | Message requests | text only if previews and you follow them, else "Sent you a message request" :415-427 | text hidden |

- The title is always the actor's display name (`displayName` :128), except a group with previews on (:407).
  Names are always shown (plan D2). **So "previews off" does not hide who sent it**, only text,
  club names and group names. The card copy must say that honestly.
- Natural grouping, which matches the Android channels in plan.md:159 ("messages" for
  dm/group/request/chat mention, "activity" otherwise):
  **Messages** = dm, group_message, message_request · **Activity** = follow, like, comment,
  mention · **Clubs** = org_invite, org_request_approved.
- Urgency: messages are `high` with a 24h TTL, likes and follows `low` with a 1h TTL (`deliveryFor` :447-453). Not a
  switch, but a reason to keep likes and follows at the bottom of the list.

## 5. Switch component and settings-row house style

- **There is no switch anywhere.** `role="switch"` has zero hits in `src/`. Every `aria-checked` belongs to a
  `role="radio"`: `src/components/safety/ReportSheet.tsx:268-269`,
  `src/components/mobile/ProfileMobile.tsx:5467-5468`, `src/app/orgs/[handle]/admin-actions.tsx:867-868`,
  `src/app/campus/campus-home.tsx:3976-3977`, `src/components/otto/OttoSettings.tsx:172-173`.
  The only on/off control is Otto's dark checkbox (§3). The `*Switch.tsx` files
  (`src/app/otto/OttoSwitch.tsx` etc.) are phone/desktop route forks, not toggles.
  → A new cream `<button role="switch" aria-checked>` is needed, local to SettingsClient or in a new
  shared file.
- The closest row to copy is `HelpLink`'s bordered row (`SettingsClient.tsx:1501-1533`):
  ```ts
  // label  :1503-1512  fontFamily "DM Sans, sans-serif", fontSize 14, fontWeight 700, color "#1C1C1E"
  // hint   :1513-1522  fontFamily "DM Sans, sans-serif", fontSize 13, color "#8A8580", lineHeight 1.45
  const style: React.CSSProperties = {           // :1525-1533
    display: "grid", gap: 2, padding: "10px 14px", borderRadius: 14,
    border: "1px solid rgba(28,28,30,0.10)", background: "rgba(255,255,255,0.55)",
    textDecoration: "none",
  };
  // rows stacked with <div style={{ display: "grid", gap: 10 }}> (:1467)
  ```
  An alternative is `BlockedRow` (:338-349): flex row, `gap: 12`, `padding: "10px 12px"`, radius 12,
  bg `rgba(255,255,255,0.55)`, border `rgba(28,28,30,0.06)`, and a right-aligned control with `flexShrink: 0`
  (:414-433). That is the exact layout for "label + hint left, switch right".
- Brand accent: `#FF5C35` (buttons :182, links :456). Body text `#5C5853`, muted `#8A8580`,
  ink `#1C1C1E`, danger `#B83030`.

## 6. What already references notifications / push / install / Home Screen

- **Nothing in `SettingsClient.tsx`.** A case-insensitive grep for
  `notif|push|install|home screen|standalone|capacitor` returns 0 hits. `src/components/settings/`
  contains only this file.
- Client helpers the card will need (they exist, and Settings uses none of them yet):
  - `appShellOnClient(): AppShell | null` (`src/lib/native/detect.ts:44`; `AppShell = "ios-app" |
    "android-app"` :15). A browser or Home Screen web app returns null (:40-43).
  - `useAppShell()` (`src/lib/native/use-app-shell.ts:47`).
  - `isStandalone(env)` (`src/lib/pwa/display-mode.ts:41`), `detectPlatform(env)` (:125),
    `isIosPlatform` (:165), `type Platform` (:55-67).
  - `useIsStandalone()` / `usePlatform()` (`src/lib/pwa/use-standalone.ts:63`, :94).
  - `src/lib/pwa/install-prompt.ts` (`BeforeInstallPromptEvent` :22).
  - `ServiceWorkerRegistrar` (`src/components/pwa/ServiceWorkerRegistrar.tsx:40`).
  - Native bridge `getPlugin`, `listenNative` (`src/lib/native/bridge.ts:67`, :102).
- Device registration API (wave 2′, already live and dark):
  - `POST /api/me/push-devices` `{transport, address, keys?, platform, app_version?}` and
    `DELETE {address}` (`src/app/api/me/push-devices/route.ts:26-40`, :116, :181).
  - Rate limits 20/h register and 30/h remove (:47-48).
  - Refusal codes: `wrong_origin`, `terms_required`, `account_restricted`, `push_unavailable` 403/503 (:31-34, :54-58).
  - The proxy lets restricted students DELETE (`src/proxy.ts:179`).
- Env: `PUSH_ENABLED`, `PUSH_ALLOWLIST` (server-only), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  (`src/lib/push/config.ts:13-15`). `pushAllowedFor` is server-only (:57).

## Gotchas / open questions

1. **Shallow merge.** `otto/settings/route.ts:95` spreads one level, so a `{push:{previews:false}}` patch
   **wipes `push.off`**. Either nest the merge for `push` (§2.1) or make the client always send the
   full `push` object. Pick one and put it in the contract.
2. **Today's route silently drops `push`** (:50-53) and answers `{ok:true, settings:null, noop:true}` (:80).
   A card shipped before the route change would show "saved" when nothing was saved. The card should treat
   `settings === null` or a missing `settings.push` as a failure, or the route change must ship in the same wave.
3. **Two keys decide mention pushes** (`payload.ts:263`: off if `push.off ∋ "mention"` OR
   `mention_pings === false`). critic-push.md:316 asks that the Otto toggle and the Settings card
   "write the same key". Options:
   - (a) The Settings "Mentions" switch reads `mention_pings !== false && !off.has("mention")` and writes
     `mention_pings` (dropping "mention" from `off`). Problem: every Otto preset forces
     `mention_pings: true` (`OttoSettings.tsx:39,46,53`), so tapping "Quiet" silently re-enables mention pushes.
   - (b) Settings writes `push.off` only, and the Otto label becomes in-app-only. Problem: a student
     who unchecked "Ping on mentions" still sees the Settings switch as ON unless the card also reads
     `mention_pings`.
   - **Recommendation:** (a), plus removing `mention_pings` from `PRESETS` (or preserving it) so a
     preset never overrides it. Either way, write the rule down and give it one owner.
4. **No read path for the card.** `settings/page.tsx:32-34` doesn't select `otto_settings`, and
   `GET /api/me/otto`'s `mergeSettings` strips `push` (`otto/route.ts:139-156`). Cheapest fix: add
   `otto_settings` to the page select and pass a derived prop
   (`parsePushPrefs` is pure and server-importable, plus `mention_pings`). Never pass the raw blob.
5. **Preference vs device state are two different things.** The per-kind switches and previews live in
   `users.otto_settings.push` (account-wide, every device). "Notifications on this device"
   is a `push_devices` row plus OS permission. The card needs both: a device section (permission / register /
   unregister) and an account section (kinds + previews). Say which is which in the copy.
6. **The allowlist is invisible to the client.** `pushAllowedFor` is env-only (`config.ts:57`). The only signal
   is `POST /api/me/push-devices` → 403 `push_unavailable` (`push-devices/route.ts:33-34, 57-58`). The card needs
   a "not available yet" state, and it should probably hide the kind switches until the device has registered, or show them
   anyway since they are account-level. Also, Preview deployments always refuse with `wrong_origin` (:117-128).
7. **No rate limit and no terms gate on PATCH `/api/me/otto/settings`.** Rapid switch flips each cost a
   read+write. A debounce like OttoSettings' 350ms (`OttoSettings.tsx:145`) plus the single-flight
   `inFlightRef` pattern (:104-140) is the house way. Decide whether push prefs need `rateLimit`
   (`src/lib/rate-limit.ts:25`).
8. **Sign out has to change in 3+ places**, not just Settings: `SettingsClient.tsx:1176` (switch to
   `json:{push_address}` + SW `SIGNED_OUT` + local `unsubscribe()`), `suspended-actions.tsx:162`,
   `accept-terms-form.tsx:82`. The two browser-only `auth.signOut` paths (`verify-school/page.tsx:235`,
   `EmailLinkProblem.tsx:75`) never hit the route at all. A shared `leaveDeviceClean()` helper
   (plan R15) should own this.
9. **Delete account** already drops the rows through the FK cascade (`…push_notifications.sql:462`), but the browser
   PushSubscription and the native FCM token stay. Call the same `leaveDeviceClean()` before
   `window.location.href = AFTER_DELETE` (`SettingsClient.tsx:1259`, `suspended-actions.tsx:212`), or
   accept that the next sign-in's re-register overwrites it (the upsert is by `address`, `push-devices/route.ts:28-30`).
10. **Restricted students never see /settings** (`proxy.ts:145-157`), so a Notifications card there cannot be
    their off switch. They rely on logout (all devices) or `DELETE /api/me/push-devices` (proxy.ts:179).
    Also, PATCH prefs from a restricted account returns 403 `account_restricted` (proxy.ts:239-245).
11. **"Previews off" still shows names** (plan D2; titles are always the actor, `payload.ts:322`). The copy
    must not promise "hide who messaged me". The iOS system "Show Previews" setting is separate
    (critic-push.md:311 open question).
12. **Mentions ≠ DM mentions**: a DM or group @mention is `covered_by_message` (`dispatch.ts:742`). The switch copy
    should say "Mentions in posts and club chats".
13. **Styling**: there is no switch component anywhere, and Otto's checkbox is dark-themed
    (`globals.css:2309-2353`). A new cream switch needs a hit target of at least 44px and `role="switch"` + `aria-checked`.
    The width budget at 375px is about 303px (§1.2), so label+hint+switch rows should use the `BlockedRow` flex layout.
14. **Header copy**: the settings subtitle (`SettingsClient.tsx:112`) and metadata (`page.tsx:13`) describe only
    account/sign out/delete. Update them if the card lands, and consider `id="notifications"` so a
    push-permission prompt or the app can deep-link to `/settings#notifications`.
