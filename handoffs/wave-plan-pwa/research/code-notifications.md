# Push notifications: what already exists in the code (research, 2026-09-24)

Scope: everything in the repo that would feed PUSH NOTIFICATIONS for the installable app.
Read-only pass over `/Users/franciscocazares/vibe` at `9c0e645` (main). No database was queried;
production row counts quoted below come from the T2 migration's own measured header (2026-09-22).

## The short version (plain English)

- Vibe already has an in-app notification list (Otto's bell). It holds **7 kinds**: follow, connection,
  like, comment, mention, org_invite, org_request_approved. One of those, "connection", has had **no
  writer in production** since someone edited the database by hand, so it never fires.
- **Direct messages are not notifications.** A new DM writes a `messages` row and nothing else. People find
  out only by polling (every 2–30 s on desktop; on phones, **not at all until they open Messages**).
- **Nothing is live.** No Supabase realtime anywhere; every badge is a timer asking the server again.
- **Phones have no unread badge today.** The Otto orb (which carries the dot) is hidden below 900px and
  the bottom tab bar has no badges. Push + the app-icon badge would be the first "you have something" signal
  a phone user gets.
- **Rows are written in three different places** (database triggers, a mentions helper, a clubs helper),
  so there is no single spot to hang "send a push" on today. The recommendation (section H) is a small
  **outbox table** fed by one database trigger, drained by one server function.
- **Blocks and mutes are applied when the list is READ, not when a row is WRITTEN.** A blocked person's
  comment still creates a row; the list just hides it. A push sent at write time would leak straight
  through a block. Every push must re-check blocks, mutes, chat mutes, hidden clubs, removals and
  suspensions at send time.
- **Email sends nothing to students about activity.** Resend carries only school verification, password
  reset and admin moderation alerts.
- **There is already a notification-settings blob** (`users.otto_settings`: "Ping on mentions" etc.) with
  toggles on the Otto page — but **nothing reads those toggles**. Push preferences can live there, and the
  toggles would finally mean something.
- **Lock-screen privacy:** DMs (message text), comments (someone else's words), club invites (the club's
  name — a private club can be sensitive) and message requests from strangers need the most care. See the
  table at the end.

---

## A. The `notifications` table

Plain English: one row per "something happened to you". Only the database's own triggers and server code
running with the admin key can create rows; a student can only read their own rows, mark them read, or
delete them.

### Columns (as of the last migration touching it)

| column | type | added in | notes |
|---|---|---|---|
| id | uuid pk | 20260504150000_notifications.sql:13 | |
| user_id | uuid → users ON DELETE CASCADE | :14 | **recipient** |
| actor_id | uuid NOT NULL → users ON DELETE CASCADE | :15 | who did it (officer for club rows) |
| type | text + `notifications_type_check` | :16 | see kinds below |
| post_id | uuid → posts CASCADE | :17 | like, comment, post mention |
| comment_id | uuid → post_comments CASCADE | :18 | comment |
| read_at | timestamptz | :19 | null = unread |
| created_at | timestamptz default now() | :20 | |
| message_id | uuid → messages CASCADE | 20260506120000_chat_mute_and_mentions.sql:21-22 (again, idempotent, 20260515100000_notifications_mention_type.sql:24-26) | chat mention |
| org_id | uuid → orgs CASCADE | 20260916103000_org_join_policy_invites.sql:863-867 | org_invite / org_request_approved |

No `pushed_at`, no delivery state, no payload/text column. Deleting a post, comment, message, club or
account cascades its notifications away.

### Kinds (the CHECK constraint history)

- `follow, like, comment` — 20260504150000_notifications.sql:16
- `+ connection` — 20260504160000_notifications_connection_type.sql:14-16
- `+ mention` — 20260506120000_chat_mute_and_mentions.sql:30-33 and 20260515100000:20-22
- `+ org_invite, org_request_approved` — 20260916103000_org_join_policy_invites.sql:869-871 (current)

Production row counts on 2026-09-22 (measured, quoted in
20260922120000_t2_notification_writes_and_helper_grants.sql:62-64): comment 8, follow 29, like 8,
mention 7. Tiny — the fan-out cost of push is not a concern at launch scale.

### RLS and grants (current)

- RLS on; policies `notifications_select_own`, `notifications_update_own`, `notifications_delete_own`,
  all `auth.uid() = user_id` (20260504150000:30-48).
- `notifications_insert_as_actor` (20260515100000:38-44) was **dropped** by T2
  (20260922120000:394). All privileges revoked from `anon`; `authenticated` lost INSERT/UPDATE and got back
  only `UPDATE (read_at)` (20260922120000:395-397). So: **no client can insert a notification.**
- Writers therefore are (a) SECURITY DEFINER triggers owned by postgres, (b) the service role.
- The moderation migration deliberately leaves notifications update/delete open to restricted students
  (20260923090000_moderation_foundation.sql:336).

### Indexes

`idx_notifications_user_unread (user_id, created_at DESC) WHERE read_at IS NULL` and
`idx_notifications_user_recent (user_id, created_at DESC)` (20260504150000:24-28);
`idx_notifications_message` / `idx_notifications_message_id` (partial, duplicates of each other:
20260506120000:24-26, 20260515100000:28-30); `idx_notifications_org` (20260916103000:867);
`idx_notifications_actor_dedupe (user_id, actor_id, type)` (20260922120000:401-402).

### Known drift

T2's header records that production's `notify_on_connection_insert` was hand-edited to write only the
`follow` row, never the two `connection` rows the migration file writes; T2 rewrote both sides to
production's body plus de-dup (20260922120000:87-103, 435-458). **Result: `connection` is a dead kind.**
It is still counted in `src/app/api/me/notifications/count/route.ts:73` and rendered by
`src/components/network/OttoSidePanel.tsx:855`. A push design should not list "connection" as a kind
unless Franky wants the "you're now connected" moment back (then restore a writer first).

---

## B. Every code path that creates a notification

Plain English: follows, likes and comments are created inside the database the moment the underlying row
lands. Mentions and club messages are created by server code after the main action succeeds. Nothing else
creates notifications — not DMs, not reposts, not comment likes, not replies to your comment, not club posts,
not moderation removals.

| kind | trigger (what the student did) | writer, file:line | recipient | de-dup / budget |
|---|---|---|---|---|
| follow | POST /api/me/follow → `connections` insert (user client) src/app/api/me/follow/route.ts:90-92 | trigger `notify_on_connection_insert` 20260922120000:435-458 (on `connections` AFTER INSERT, 20260504150000:71-75) | the person followed (`following_id`) | one per (recipient, actor) ever while a row exists — follow/unfollow/follow notifies once (20260922120000:448-453) |
| connection | — | **no writer in production** (see drift) | — | — |
| like | POST /api/posts/[id]/like → `post_likes` insert with **service role** src/app/api/posts/[id]/like/route.ts:110-112 | trigger `notify_on_like_insert` 20260922120000:407-431 | post owner (skips self-like) | one per (owner, liker, post) while a row exists |
| comment (incl. replies) | POST /api/posts/[id]/comments → `post_comments` insert (user client) src/app/api/posts/[id]/comments/route.ts:320-331 | trigger `notify_on_comment_insert` 20260504150000:104-127 | **post owner only** (skips self). The parent commenter of a reply is NOT notified | none — every comment is a row |
| mention (post) | publish: src/app/api/me/publish-post/route.ts:202-227; first publish of a draft: src/app/api/posts/[id]/route.ts:624-653; edit adding a handle: :655-701 | `insertMentionNotifications` src/lib/mentions.ts:149-196 (service role) | each @handle that resolves to a user, minus the author | ≤20 per post/edit (mentions.ts:51), ≤60 per sender per hour (mentions.ts:68-69); edit only pings newly added handles not already pinged (posts/[id]/route.ts:659-697). **Club posts never send mentions** (posts/[id]/route.ts:622; publish-post only writes personal posts) |
| mention (chat) | POST /api/me/threads/[id]/messages src/app/api/me/threads/[id]/messages/route.ts:580-630 | same helper, `kind:"message"` | @handles who are members of that DM/group (`channel_members`) or of the club (`org_members`) for club channels (:591-605) | same 20 / 60 budget |
| org_invite | officer invites: src/app/api/orgs/[slug]/invites/route.ts:607-612 | `notifyOrg` src/lib/orgs/membership.ts:391-428 (service role) | the invited student | invite limits 30/h per officer, 100/day per club, 10/day per invitee (invites/route.ts:96-100) |
| org_request_approved | officer approves: src/app/api/orgs/[slug]/requests/[id]/route.ts:275-280 | `notifyOrg` | the student who asked | — |

Rows are also **removed or marked read** (a push layer must not resurrect them): invite revoked
(src/app/api/orgs/[slug]/invites/[id]/route.ts:112-118), club audience narrowed
(src/app/api/orgs/[slug]/route.ts:183-191), club hidden by an admin
(src/app/api/admin/orgs/[slug]/hide/route.ts:236-242), invite accepted (membership.ts:303-311) or
declined (src/app/api/me/org-invites/[id]/route.ts:124-131).

Not written anywhere (possible future push kinds, all need a new writer): DMs, message requests, replies to
your comment, comment likes, reposts, club posts to followers, event reminders / RSVP day-before, Otto
reminders due, moderation outcomes ("your post was removed", "your report was actioned"). Reminders and
day-before pings would also need a scheduler: there is **no cron of any kind** in the repo (no
`vercel.json`, no `pg_cron`, no Supabase edge functions — `supabase/` holds only config, migrations,
snippets, templates).

---

## C. Direct messages: how a recipient learns of a new message today

Plain English: a DM is just a row in `messages`. There is no notification row for it and nothing pushes it
anywhere. Each screen asks the server again on a timer. On a phone, the Messages list loads once when you
open it and never refreshes on its own, so a phone user learns of a new DM only by opening the app and
tapping Messages.

- **One write path.** Every message goes through `POST /api/me/threads/[id]/messages`
  (src/app/api/me/threads/[id]/messages/route.ts:370): 60/min per sender (:381), Terms + verified school
  email + not restricted (`requireCanPublish`, :387-388), block guard for DMs and groups but **not club
  channels** (:504-527, fails closed), insert with the user's own client (:538-550), then @mention fan-out
  (:580-630). No other code inserts into `messages`. (A student can still insert directly through
  PostgREST: `authenticated` holds INSERT on `messages`, per 20260922120000:74-78, gated by
  `messages_insert_member` + `has_recorded_consent`/`can_publish_now`. That path skips the route's rate
  limit and word filter — relevant to section H.)
- **Three channel shapes.** 1:1 `dm` and `group` channels use `channel_members` (accepted_at,
  last_read_at, hidden_at, muted_until, cleared_at). Club channels (`channels.org_id` set) use
  `can_view_org_channel` instead and skip channel_members entirely (src/lib/messages/channel-access.ts:36-65).
- **Message requests.** A first DM to someone you are not mutually connected with creates their
  membership with `accepted_at = null` (src/app/api/me/threads/route.ts:335-353); it shows in the Requests
  tab, not Chats (:593-599, :640-647). Replying accepts implicitly (messages/route.ts:561-571).
- **No realtime.** `rg postgres_changes|.channel(` finds nothing; the only `subscribe(` hits are a media
  query hook and an auth listener. Supabase realtime is not used anywhere.
- **Polling cadence today:**
  - desktop static pages: open chat 2 s, thread list 30 s (public/html/messages.html:1734-1735, 2468-2472,
    3523-3526); mini-messenger background badge 30 s, list 5 s, chat 2 s, skipped when the tab is hidden
    (public/html/_miniMessenger.js:280-282, 306-313).
  - phone: an open conversation polls every 2 s (src/app/campus/campus-home.tsx:14422); the thread list
    (src/components/mobile/MessagesMobile.tsx:365-398) loads on mount and after the student's own actions —
    **no interval**.
- **Chat mention vs. message push:** a mention inside a DM writes a `mention` row too. If DMs push every
  message, the dispatcher should drop the mention push for the same `message_id` (or merge them) so the
  student is not buzzed twice for one message.

---

## D. Email, preferences, and where push settings would sit

Plain English: Vibe never emails students about activity. There is a settings blob for "ping me about…"
toggles, shown on the Otto page, that nothing obeys yet. The Settings page itself has no notification
section at all.

### Resend and `email_sends`

- Client: src/lib/resend.ts:13-19 (`RESEND_API_KEY`). Sends go through `sendLogged`
  (src/lib/email/send-log.ts:30) which writes one `email_sends` row per attempt.
- `email_sends` (20260922104000_email_sends.sql:143-166): kind, user_id (SET NULL on delete),
  recipient_domain, keyed recipient_hash (never a plaintext address; every text column refuses `@`),
  provider_message_id, ok, error fields, http_status. No client grants; service role only.
- Kinds: `school_verification`, `password_reset` (:145-146), plus `moderation_alert` added by
  20260923090000_moderation_foundation.sql:2726-2729. Moderation alerts go to the three admins only
  (src/lib/moderation/alerts.ts:12-29, and it deliberately puts **no reported text** in the email).
- **Useful precedent for push:** this is the exact shape a `push_sends` log would want (hashed endpoint,
  coarse provider domain, status, no content), and alerts.ts's "no content in the out-of-band channel" rule
  is the same privacy stance section I recommends for lock screens.

### Preferences that exist today

- `users.otto_settings jsonb NOT NULL DEFAULT '{}'`
  (20260512000000_otto_reminders_and_settings.sql:16-17), private column, read and written through the
  service role (src/app/api/me/otto/route.ts:171-179; src/app/api/me/otto/settings/route.ts:83-108).
- Accepted keys (settings/route.ts:18-26): `chattiness` quiet|moderate|loud, `rsvp_day_before`,
  `mention_pings`, `milestone_pings`, `daily_summary`, `summary_time`, `unanswered_dm_pings`. Unknown keys
  are silently dropped (:51-54), so adding `push_*` keys needs a whitelist change there.
- UI: `src/components/otto/OttoSettings.tsx:61-65` ("Ping on mentions", "Ping on unanswered DMs >24h" …),
  rendered on /otto (OttoPageClient.tsx, OttoMobile.tsx).
- **Nothing reads them.** `rg mention_pings` hits only the UI, the settings route and the merge in
  `/api/me/otto`. No writer, reader or send path checks a toggle. `rsvp_day_before`, `daily_summary`,
  `milestone_pings` and `unanswered_dm_pings` also have no generator (no cron — section B).
- Per-thread and per-person mutes, which are preferences in effect:
  - `channel_members.muted_until` (20260506120000:14-19). Its UI copy already **promises** "No unread badge
    or notification ping for messages in this chat" (public/html/messages.html:3103; also :2953-2955).
  - `channel_member_mutes` (20260506140000_channel_member_mutes.sql): mute one person inside one group.
    Header says "record-only. Notification suppression for chat events isn't wired yet — when it lands, the
    consumer joins this table" (:7-9). **Push is that consumer.**
  - `mutes` (global person mute; optional `until`) and `blocks` — section F.

### Where push settings would sit

- `/settings` (src/app/settings/page.tsx → src/components/settings/SettingsClient.tsx:115-124) renders
  Account info, Campus, Handle, Campus tour, Blocked users, Help & safety, Sign out. **No notifications
  card.** A new `NotificationsCard` between Campus tour and Blocked users is the natural home for: device
  on/off (subscribe/unsubscribe this browser), per-kind toggles, and a "show message text on lock screen"
  switch. /settings is shared by phone and desktop (CampusAppShell).
- Recommendation: store per-kind push choices in `otto_settings` (no migration; whitelist new keys) OR a
  small `push_preferences` column set — Franky's call (decision 2). Either way make the Otto page toggles
  and the Settings card read the same keys, so "Ping on mentions" finally controls the mention push.

---

## E. Unread counts and badges today (for the Badging API)

Plain English: two separate numbers, computed by different endpoints with slightly different rules, both
polled. A phone shows neither on its tab bar.

| number | endpoint | rule | who polls it |
|---|---|---|---|
| notifications unread | `GET /api/me/notifications/count` src/app/api/me/notifications/count/route.ts:18-107 | unread rows for the viewer, **excluding actors blocked either way or muted now** (:35-49, :71); also returns `unread_mention` and 30-day per-kind totals | OttoCorner every 30 s (src/components/network/OttoCorner.tsx:98-138), public/html/_otto.js:692, :875; OttoSidePanel :140 |
| DM threads unread (desktop dot, phone Chats tab) | `GET /api/me/threads` src/app/api/me/threads/route.ts:376-650 | per thread boolean `unread` = latest message is from someone else and newer than your `last_read_at` (:609-612); hides 1:1 threads with a blocked peer (:566-587), hidden threads unless reactivated (:603-607), requests go to a separate list. **Client** then drops threads with `muted_until` in the future (_miniMessenger.js:321-326; MessagesMobile.tsx:459-466) | mini-messenger 30 s; phone only on open |
| DM unread count on Otto | `GET /api/me/otto` src/app/api/me/otto/route.ts:398-452, 470, 479 | **1:1 DMs only** (no groups), accepted and not hidden, skips a latest message from a blocked **or muted** sender (:444) — but **ignores `muted_until`** | /otto page load |

- The three DM rules disagree (groups in or out; person-mute vs. thread-mute). A badge that disagrees with
  the list it summarises is the bug the count route's own comment warns about (:28-34).
- Phones: `#otto-corner { display:none }` below 900px (src/app/globals.css:2641-2642) — the component still
  mounts and polls, the dot is just invisible; `MobileTabBar` has no badge at all
  (src/components/mobile/MobileTabBar.tsx:32-116).
- **Recommendation:** one new `GET /api/me/badge` → `{ notifications, messages, total }`, computed with
  one shared helper that the count route, the threads route and the push dispatcher all call, with one DM
  rule (1:1 + groups, not requests, not hidden, not `muted_until`, not from a blocked/muted sender). The
  dispatcher puts `total` in each push payload so the service worker can call `navigator.setAppBadge(total)`
  on the push event without a network round trip; the app calls the same endpoint on focus and after
  mark-read (`POST /api/me/notifications/mark-read` src/app/api/me/notifications/mark-read/route.ts, and the
  thread read route) to clear it. WebKit: on iOS the Home Screen icon shows the badge only once
  notification permission is granted ("Web Push for Web Apps on iOS and iPadOS",
  https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/, published 2023-02-16).

---

## F. What must stop a push, and where each rule is checked today

Plain English: today almost every safety rule is applied when the list is **shown**, not when the row is
**made**. That was fine for a list — a hidden row simply never appears. A push is different: once it is on a
lock screen it cannot be taken back. So the push sender has to ask every one of these questions itself, at
the moment it sends, and when it is unsure it must not send (fail closed — the list routes already do).

Also: browsers require a visible notification for **every** push. WebKit: developers must "set the
`userVisibleOnly` flag to true, and fulfill that promise by always showing a notification", and violations
"will result in a push subscription being revoked" ("Meet Web Push", https://webkit.org/blog/12945/meet-web-push/,
published 2022-06-07). So the service worker cannot quietly drop a push it should not have received; all
suppression has to happen **on the server, before sending**.

| rule | where it lives | checked today at | must it suppress a push? | send-time check |
|---|---|---|---|---|
| **Block, either direction** | `blocks` (20260506100000_safety_block_mute_report.sql:15-43; either-party read via `blocks_select_either`, 20260515000000) | READ: list, count, Otto (src/lib/safety/hidden-users.ts:26-58 used at notifications/route.ts:68-79, count/route.ts:35-49, otto/route.ts:193-214). WRITE: follow (follow/route.ts:72-89), like (like/route.ts:94-101), DM/group send (messages/route.ts:504-527). **NOT** at write for comments (comments/route.ts:258-268 has no block check; handoff S64 §11 "blocked students can still comment on, save or repost the blocker's posts"), post mentions (`resolveMentionedUserIds` mentions.ts:30-45 does not filter), or club-channel messages and mentions (block guard skipped, messages/route.ts:504-509) | **Yes, always** | `is_blocked_either_way(recipient, actor)` or the pair-block helpers (src/lib/safety/pair-block.ts) |
| **Person mute** (`mutes`, `until` null = forever) | 20260506100000:44-60 | READ only (hidden-users.ts:46-51). The table's own header promises the muter doesn't "get notifications from them" (20260506100000:7-8) | **Yes** — including that person's DMs (Otto's DM count already skips them, otto/route.ts:442-444; the thread itself stays visible, threads/route.ts:564-565) | `is_muting_now` (converged by 20260922090000) |
| **Chat mute** (`channel_members.muted_until`) | 20260506120000:14-19 | CLIENT only: badge math in _miniMessenger.js:321-326 and MessagesMobile.tsx:459-466. UI copy promises "No unread badge or notification ping" (messages.html:3103) | **Yes** for every message in that chat. Whether an @mention breaks through a chat mute is decision 3 | read the recipient's channel_members row |
| **Mute one person in one group** (`channel_member_mutes`) | 20260506140000:11-20 | **nowhere** — "record-only … the consumer joins this table" (:7-9) | **Yes** for that person's messages in that channel | join on (channel, recipient, sender, until) |
| **Hidden club** (`orgs.hidden_at`) | orgs | READ: club rows drop in `attachNotificationOrgs` (src/lib/orgs/notification-orgs.ts:19-23, 52+). WRITE: hiding revokes pending invites and deletes their rows (admin/orgs/[slug]/hide/route.ts:236-242) | **Yes** for org_invite / org_request_approved and club-channel messages of a hidden club | read `orgs.hidden_at` with the service role. UNVERIFIED: whether `can_view_org_channel` itself refuses a hidden club's channels |
| **Removed content** (`removed_at` on posts, post_comments, messages) | 20260923090000:1-120 item 6 | READ: RLS hides removed rows from everyone but the author; the notification row stays, its post/comment embed turns null (hidden-club note, 20260922140000:171-173 describes the same null-embed effect) | **Yes** if the source is already removed when the push is built (queued pushes) | re-read the source row; skip if removed_at set |
| **Restricted actor** (suspended/banned) | `account_restrictions` (20260923090000:1828-1847), `user_visible()` (:2002-2020) | WRITE: the proxy refuses every write from a restricted session except logout, account delete, billing portal, block, mute (src/proxy.ts:172-177, used at :239), plus policy ANDs. So no new rows from them through the app. Old rows stay; the actor embed goes null because `users_select_authenticated` now ANDs `user_visible(id)` (20260923090000:2330-2333) | **Yes** for anything still queued | `user_visible(actor_id)` via service role (it answers `service_role` truthfully, :2568-2580) |
| **Restricted recipient** | same | proxy holds them at /account/suspended; every tap would land there | **Yes, all pushes** (a future "your appeal was answered" moderation push would be the only exception) | the same lookup as `getActiveRestriction` (src/lib/moderation/access.ts:89) |
| **Signed out of this device** | — | nothing (no subscriptions exist) | **Yes** — unsubscribe this device's endpoint on logout, or a shared phone keeps getting the last account's DMs. Session 64 lesson: a magic link does not switch accounts if someone is already signed in | logout route deletes the row for this endpoint; `/api/auth/logout` is already on the restricted allow-list (proxy.ts:173) |
| **Already read / already looking** | `read_at`, `last_read_at` | — | Skip if `read_at` is set or the thread's `last_read_at` is past the message by send time | re-read at send time |
| **Terms not accepted** | consent columns | `requireTermsAccepted` on writes | Don't let a subscription be created before Terms; don't push to someone without consent on record | gate the subscribe route |

Proxy note for the SW builders: the proxy already exempts `js`, `json`, `webmanifest` from the restriction
redirect precisely so a future service worker is not answered with an HTML page (src/proxy.ts:84-98). A
push-subscription **DELETE** route must be added to `restrictedApiAllowed` (proxy.ts:172-177) so a
suspended student can still turn pushes off.

---

## G. The rate limiter and the mention budget: how push fan-out should respect them

Plain English: Vibe counts actions per person in the database (so the count holds across Vercel's many
servers). Mentions already have a budget of 60 people an hour per sender. The push sender should not spend
that budget again; it should add its own small limit **per recipient**, and fold bursts ("12 new likes")
into one notification instead of twelve.

- **The limiter:** `rate_limit_hit(key, limit, window)` — fixed window, one row per (key, window start),
  every call adds 1 and answers `count <= limit` (20260903100000_security_hardening.sql:279-324; service
  role only, :323-324). TS wrapper `rateLimit()` is **fail-open** by default, `failClosed` optional
  (src/lib/rate-limit.ts:25-48). Every call spends one unit even when the answer is no — so call it once
  per push, never as a "peek".
- **Per-actor limits that already bound how many rows can exist:** follow 60/10 min
  (follow/route.ts:67), like 120/10 min (like/route.ts:28), comment 30/5 min (comments/route.ts:253),
  message 60/min (messages/route.ts:381), publish 20/10 min (publish-post/route.ts:88), post edit
  30/10 min (posts/[id]/route.ts:482), invites 30/h per officer, 100/day per club, 10/day per invitee
  (invites/route.ts:96-100). These guard the **sender**. Nothing guards the **recipient**: 30 people
  liking one post is 30 rows, legitimately.
- **The mention budget:** `MENTION_BUDGET = 60` per hour per sender, spent one unit **per person
  notified**, cap 20 per post/edit/message (src/lib/mentions.ts:51-69), checked inside
  `insertMentionNotifications` before any row is written (:163-175, via `mentionSlotsLeft` :89-123, which
  calls the RPC directly and fails open). Rows past the budget are never written. So: **a push per mention
  row inherits the budget for free — the dispatcher must NOT call `mention:<actor>` again.**
- **Gaps a push would amplify:** follow/like rows are de-duplicated per pair (20260922120000:404-458) but
  comments are not, and `post_comments` and `messages` can be inserted straight through PostgREST
  (policies `post_comments_insert_own`, `messages_insert_member` + `can_publish_now()`,
  20260923090000:2198, 2257), which skips the route's rate limit **and the word filter**. A trigger-fed
  push would therefore let a student bypass the route and buzz someone's phone with unfiltered text.
- **Recommended push-side limits:**
  1. Per recipient: `push:<recipient>` e.g. 20 per 10 min (fail-open is fine — it is annoyance control).
  2. Per (actor → recipient) for chat: `push-pair:<actor>:<recipient>` e.g. 10 per minute, so one
     person cannot machine-gun a phone even inside the per-sender 60/min.
  3. Collapse instead of drop: use the notification `tag` (and the Web Push `Topic` header) per thread
     (`dm:<channel_id>`) and per post-and-kind (`like:<post_id>`), so a burst replaces one lock-screen
     entry rather than stacking. Past the limit, keep the in-app row, skip the push.
  4. Run comment and message text through the same `checkText` the routes use
     (src/lib/moderation/text-filter.ts:145) before it goes into a preview; if it fails, send the generic
     line with no text.

---

## H. One place for `sendPush(userId, payload)` — is there a choke point today? (No.) Recommendation.

Plain English: there is no single "a notification was just created" moment in the code. Follows, likes and
comments are made inside the database by triggers the app never sees; mentions come from one helper;
club invites from another; DMs make no notification at all. The one thing the first three share is the
`notifications` table itself. So the cleanest single door is **a trigger on that table** that drops a
"to send" slip into a small outbox, plus the messages route dropping slips for DMs. One server function
then empties the outbox, applies every rule in section F, and is the only code that talks to Apple and
Google.

### Today's entry points (all of them)

| family | where | knows a row was created? |
|---|---|---|
| SQL triggers: follow, like, comment | 20260922120000:407-458; 20260504150000:104-127 | **No.** The like and follow triggers de-duplicate silently, so the route cannot tell whether a notification (and so a push) happened |
| `insertMentionNotifications` | src/lib/mentions.ts:149 (3 callers: publish-post :214, posts/[id] :642 and :690, messages :614) | yes (returns `inserted`) |
| `notifyOrg` | src/lib/orgs/membership.ts:391 (2 callers: invites/route.ts:607, requests/[id]/route.ts:275) | no (void) |
| DMs | messages route only (:538-550) | n/a — no notification row |

### Options

1. **Call push from every route (TS only).** Seven-plus call sites, and the trigger-born kinds can't know if
   a row was actually written. Drifts the moment someone adds a kind. Not recommended.
2. **Trigger → `pg_net` HTTP call → a Vercel route.** One place and immediate, but needs the `pg_net`
   extension (no migration enables it; UNVERIFIED whether it is on in the project), a secret stored in the
   database, and it pushes on direct PostgREST inserts that skipped the route's limits. Supabase "Database
   Webhooks" are the same thing configured in the dashboard, which is the kind of hand-made, unmigrated
   state that caused the `connection` drift. Not recommended for v1.
3. **Outbox (recommended).**
   - `push_subscriptions` (user_id FK → users ON DELETE CASCADE, endpoint UNIQUE, p256dh, auth, coarse
     platform, created_at, last_ok_at, failures). RLS on, no policies, service role only — the
     `account_restrictions` / `email_sends` pattern (20260923090000:1857-1860; 20260922104000:168-169).
     The subscribe/unsubscribe routes write with the service role after auth + Terms.
   - `push_outbox` (id, user_id, source 'notification'|'message', notification_id FK CASCADE,
     message_id FK CASCADE, created_at, claimed_at, sent_at, skipped_reason). Service role only.
   - **One AFTER INSERT trigger on `notifications`** (SECURITY DEFINER, same shape as the three that
     exist) writes one outbox row per notification. It rides the same transaction, catches all three
     writer families, and catches any kind added later with zero extra code. Cascades clean up if the
     source is deleted before sending.
   - **Messages:** the messages route enqueues one outbox row per recipient (DM/group members except the
     sender; club channels only via their @mention rows) with the service role, after the insert. Doing it
     in the route (not a trigger on `messages`) means a direct PostgREST insert never buzzes a phone.
   - **Draining:** `drainPushOutbox()` in `src/lib/push/dispatch.ts`, claimed with `FOR UPDATE SKIP
     LOCKED` through an RPC so two drains never double-send. Kicked by `after()` from each writer route —
     precedent: src/app/api/auth/password-reset/route.ts:1, 78 already uses `after` from `next/server` —
     plus a scheduled backstop drain (Vercel Cron; UNVERIFIED how often the current Vercel plan allows).
   - **The single hook:** `sendPush(userId, payload)` in `src/lib/push/send.ts` is the only code that holds
     the VAPID private key and calls the push services; deletes a subscription on 404/410; logs one row per
     attempt with no content (the `email_sends` shape). `buildPayload(outboxRow)` in dispatch.ts is the only
     code that decides lock-screen text and runs every section F check, the preferences, `checkText`, the
     per-recipient limits, the collapse tag, and the badge total (section E).
   - Alternative if Franky wants fewer tables: a `pushed_at` column on `notifications` as the outbox for
     notification kinds (clients can only UPDATE `read_at`, 20260922120000:397, so it stays server-owned),
     plus the route-level path for DMs. Works, but DMs then have a second queue anyway.

### Things the builders must not forget

- Logout must delete this device's subscription; account deletion (src/app/api/me/route.ts:137
  `auth.admin.deleteUser`) cascades it if the FK is right.
- Add the unsubscribe route to `restrictedApiAllowed` (src/proxy.ts:172-177).
- Tap targets already exist in `OttoSidePanel.tsx:925-953`: club rows → `/orgs/{handle}`, like / comment /
  post mention → `/posts/{id}`, follow → `/profile/{handle}`. Chat mention goes to plain `/messages` today;
  a push should use the existing `?channel=<id>` deep link (MessagesMobile.tsx:400) instead.
- The Otto corner's live toast only pops for a **mention from a mutual connection** and stays a silent dot
  otherwise (OttoCorner.tsx:16-20, 64-83). That is the product's existing answer to "who may interrupt
  me"; the push defaults should start from it.

---

## I. What a lock-screen preview would reveal, per kind

Plain English: a lock screen is readable by anyone holding the phone. The payload itself is encrypted all the
way to the device (Web Push message encryption, RFC 8291, https://www.rfc-editor.org/rfc/rfc8291, Nov 2017),
so Apple and Google can't read it — the exposure is the screen. Today's in-app wording comes from
`verbFor` / `snippetFor` (src/components/network/OttoSidePanel.tsx:851-881); copying it verbatim would show
the following.

| kind | if we copy the in-app row | risk | recommended default |
|---|---|---|---|
| follow | "{Name} started following you" | low; naming the actor is the accepted free exception (ruling M6, 20260922110000:63-65) | name, no text |
| like | "{Name} liked your post" + **your own post's text** | low | name only; collapse per post ("Name and 4 others") |
| comment | "{Name} commented…" + **the commenter's words** | medium: someone else's text, and the direct-PostgREST path skips the word filter | name + ≤100 chars **after `checkText`**; generic line if it fails |
| mention (post) | "{Name} mentioned you" + the author's post text | medium | same as comment |
| mention (chat) | "{Name} mentioned you in a chat" (text not embedded today) | medium: reveals group membership if the group name is shown | name + group name (group names pass `checkText` at creation, threads/route.ts:264); message text only if the student turned previews on |
| **DM** (new kind) | n/a — would be "{Name}: {message}" | **high**: private words on a lock screen | decision 4 — show name, text behind a "Show message previews" switch; media = "sent a photo", never the image; a shared post = "shared a post" |
| **message request** (new) | n/a | **high**: unsolicited text from a stranger is the harassment path | "New message request" — no name, no text |
| group chat message (new) | "{Group}: {Name}: {text}" | high | as DM, grouped by thread tag |
| club channel message | — | noise + fan-out (a whole club) | no per-message push in v1; @mentions only |
| org_invite | "{Officer} invited you to join {Club}" | **medium-high**: a club's name can out someone (cultural, religious, LGBTQ+, Greek) | club name for public clubs; "You have a club invite" for invite-only / hidden-audience clubs |
| org_request_approved | "{Officer} approved your request to join {Club}" | medium: the student asked | same club-name rule as invites |
| connection | — | dead kind | none |

UNVERIFIED: whether iOS's system "Show Previews: When Unlocked" setting applies to Home Screen web-app
notifications the way it does to native apps. If it does, the in-app switch is a second layer, not the only
one.

---

## J. Decisions for Franky, and what is still unverified

1. **Which kinds push at launch?** Recommended: DMs + group chats, message requests (generic), mentions,
   comments, club invites and approvals. Likes and follows: collapsed, and off by default — they are the
   noisiest and the least actionable.
2. **Where push preferences live.** Recommended: new keys in `users.otto_settings` (no migration; the Otto
   toggles and a new Settings card read the same keys; whitelist in settings/route.ts:18-54). Alternative:
   a dedicated table.
3. **Does an @mention break through a chat mute?** Recommended: no in v1 — the mute copy promises "no …
   notification ping" (messages.html:3103).
4. **Message text on the lock screen by default?** Options: (a) name + text, switch to hide (the iMessage /
   Instagram norm); (b) name only, switch to show (safer default for a campus launch). Recommended: (b).
5. **Club names in invite pushes for private clubs** — recommended generic.
6. **The dead `connection` kind** — restore a writer or drop it from the count route and the panel.

Open / UNVERIFIED: `pg_net` availability (only matters for option 2); Vercel Cron frequency on the current
plan; whether `can_view_org_channel` refuses a hidden club's channels; iOS "Show Previews" for web apps;
whether `post_comments` / `messages` direct inserts are otherwise rate-limited in the database (no limiter
found in any policy).
