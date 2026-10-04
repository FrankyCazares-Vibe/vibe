# Map 06: rooms inside a club, who may see or post, and the ground for pinned messages

Read Oct 3, 2026 on branch `chat-desktop` (same as main, `e7869b9`). Read-only. Every claim has a path:line. Paths are from the repo root. "A" = `supabase/migrations/20261001100000_chat_v2_rooms.sql`, "B" = `supabase/migrations/20261001110000_chat_v2_cards.sql`, "C" = `supabase/migrations/20261001120000_chat_latest_per_room.sql`.

## Short answer

- **Extra rooms already exist in the data and on old desktop.** An owner or admin can create one, make it private, and name who sees it. The phone's new chat shows them as chips but has no screen to create or edit them.
- **"Only some people can post" does not exist** outside the Board. The database rule says: if you can see a Lounge, the Officers room or an extra room, you can post in it (A:1389). This is the one gap in the data model for point 11.
- **Smallest fix:** one column, `channels.post_policy` (`everyone` / `officers` / `listed`), one new arm in `can_post_org_channel`, and one small edit to the vote function. No new table for rooms.
- **Pins:** nothing called a message pin exists. Three other things are already called "pin" (a pinned chat, a pinned club channel, "Pin to top"), so the new names must not collide. Smallest design: one service-only table `chat_message_pins`, one trigger, three routes, a cap of 20 per chat. "Shared" is one read of rows that already exist.

---

## 1. What exists

### 1.1 The data model for rooms

| Thing | What it is | Where |
|---|---|---|
| `channels.type` | `dm`, `group`, `org_channel`, `org_subchannel` (no code makes a subchannel; A stops if it meets one) | `20260430190000_phase1_initial_schema.sql:93-102`, A:567-570 |
| `channels.org_id` | the club; null for a dm or group | same, :95 |
| `channels.is_private`, `position`, `topic` | privacy, order, a one-line topic | `20260507100000_org_channels_schema.sql:47-50` |
| `channels.pinned` | a club channel pinned to the top of the old Campus rail (NOT a message pin) | `20260507130000_org_channel_pinning_and_access.sql:17-18` |
| `channels.kind` | `board`, `lounge`, `officers`, `event`, `room`; null for dm and group | A:708-710, CHECK A:827-830 |
| `channels.event_id` | set only when `kind = 'event'`; one room per event | A:710, A:716-717, A:833-834 |
| Fixed privacy | Board and Lounge are always public; Officers and event rooms are always private. An extra `room` may be either | A:835-838 |
| One of each core room per club | unique index on `(org_id, kind)` for board, lounge, officers | A:718-719 |
| `channel_members` | one row per (room, person): `last_read_at`, `pinned_at`, `hidden_at`, `muted_until`, `cleared_at`, `accepted_at`, `typing_until`. In a club it is the "subscription" row, not the access rule | phase1:104-111; `20260504180000`:14-16; `20260505120000`:6-7; `20260505140000_dm_pin.sql:4-5`; `20260506120000`:14-15; `20260509100000`:22-23 |
| `org_channel_members` | the by-name allow list of a private room: `(channel_id, user_id, added_at, added_by)` | `20260507130000`:24-30 |

Who holds a `channel_members` row in a club (the invariant, A:848-850):
- every member, on every PUBLIC room (board, lounge, public `room`): triggers A:932-939 (new room), A:989-997 (new member), repair A:1241-1250;
- officers and Going/Maybe members, on an event room: A:919-931, A:999-1011;
- **nobody on the Officers room or a private `room`**: "An Officers room or a private room: nothing" (A:940). Result: no unread dot, no mute, no mark-read there (wave-2 contract 14.36, `wave-2-contracts.md:1122`).
- a `room` turned private loses all its rows; turned public, everyone gets one (A:942-957).

`chat_repair_club(p_org uuid)` (A:1202-1306): service role only (refuses anon and authenticated from inside, A:1211-1213). Creates the missing Lounge, Board, Officers (A:1220-1227) and event rooms (A:1231-1238), adds missing rows (A:1241-1268), deletes rows that should not exist (A:1272-1295), sets `accepted_at` (A:1299-1305). It never touches `org_channel_members` and never creates an extra `room`.

### 1.2 The database rules: who can READ and who can POST

**Read.** `can_view_org_channel(cid, uid)` (A:1319-1344), in order: anon no; under `authenticated` it answers only about the caller; not a club member no; **event room** = owner/admin or holds a `channel_members` row; **public** yes; **private** = owner/admin, or a row in `org_channel_members`. Mods get no automatic pass (`20260507140000_private_channel_owner_admin_only.sql:1-8`).
- Messages: `messages_select_org_member` = not removed (or my own) AND `can_view_org_channel` (`20260923090000_moderation_foundation.sql:2244-2252`).
- Channel rows: `channels_select_org_member` (`20260507110000_org_channels_helpers_rls.sql:155-156`). So a room I cannot enter is invisible to my cookie client, name included.
- Roster rows: `channel_members_select_member` AND `can_read_channel_roster` (`20260928150000_club_chat_posts_rules.sql:255-267, 280`).

**Post.** `can_post_org_channel(cid, uid, root)` (A:1362-1394):

| Room | New top-level message | Reply (`root` set) |
|---|---|---|
| any | no unless `can_view_org_channel` is true (A:1375) | same |
| board | owner or admin only (A:1376-1377) | any member, under a live top-level post of this Board (A:1378-1383) |
| event | until the event's end + 7 days (A:1385-1388) | no (A:1384) |
| lounge, officers, room | **yes for everyone who can see it** (A:1389) | no (A:1384) |

It is the wall for direct writes: `messages_insert_org_member` calls it (A:1409-1418) and also forces `kind = 'text'`, no media, no forged removal. Cards go through it too: `chat_create_poll` / `chat_create_event_card` raise P0C21 when it says no (B:63-65). Its fingerprint after A is `8d8be860d3f7077b9d6f9238705bdca7`, `can_view_org_channel` is `747ee06d2e4c3e8a788129f7530ec0ae` (A:72-75; B checks both, B:380-393, B:1124-1125).

**Manage.** `channels` INSERT is revoked from `authenticated` (`20260928150000`, item 5, :57-60), so rooms are created only by a route with the service role. `org_channel_members` policies let owner/admin insert and delete, and a person delete their own row (`20260923090000`:2507-2528); the routes use the service role anyway.

**Leaving a club** deletes the person's `channel_members` AND `org_channel_members` rows (`20260928100000_club_membership_rules.sql:295-305`). **A demotion does not** remove an allow-list row: a demoted officer who was also added by name keeps the Officers room (A:62-64; accepted, contract 14.30).

### 1.3 App-side copies of the rules

| Piece | What it does | Where |
|---|---|---|
| `BOARD_POSTER_ROLES` = owner, admin; `ROOM_MODERATOR_ROLES` = owner, admin, mod | the two role lists chat uses | `src/lib/chat/room-rules.ts:21,24` |
| `postRefusal(room, rootId, role): PostRefusalCode` | picks the words AFTER the database said no. Non-Board, no root → always `room_closed` ("This chat is closed.") | `room-rules.ts:112-126` |
| `clubRoomLabel(clubName, kind, roomName)` | "Salsa Club · Lounge"; an extra room goes by its own name | `room-rules.ts:83-93` |
| `canModerate`, `outranks` | who may remove whose message | `room-rules.ts:47-49, 67-71` |
| `loadRoom(channelId): Promise<Room \| null>` | service read of `id, kind, name, org_id, event_id`; null = dm/group OR the read failed | `src/lib/chat/rooms.ts:130-183` (select at :138) |
| `canPostAnswer(client, channelId, userId, rootId)` → `"yes" \| "no" \| "failed"` | asks `can_post_org_channel`; on a database without the function it answers "yes" | `rooms.ts:219-252` |
| `filterRoomReaders`, `clubRole` | who can read a room (mentions); a person's club role | `rooms.ts:281-320, 327-349` |
| `roomState(starts_at, ends_at, now)` | soon / live / after / closed, event rooms only | `src/lib/chat/room-state.ts:108-118` |
| `spaceCanPost(kind, role, state)` | the TypeScript guess of `can_post` for the chips: Board = officer, event = not closed, **else true** | `src/lib/chat/reads.ts:175-179` |
| thread list `can_post` | Board = officer, **else true** | `src/app/api/me/threads/route.ts:815-817` |
| `orderSpaceRooms` | lounge, board, officers, open event rooms by start, then `room`s by position then name | `reads.ts:181-219` |
| `describeRoom` / `viewerInRoom(room, role, mayPost)` | the thread read's `viewer.can_post` is the DATABASE's answer; `can_reply` true only on a Board | `src/lib/chat/message-read.ts:1150-1166, 1177-1185` |
| `ensureMember(supabase, channelId, userId): ChannelAccess` | the one gate for a thread: club room → `can_view_org_channel`; dm/group → a `channel_members` row, returns `accepted_at`, `cleared_at` | `src/lib/messages/channel-access.ts:52-152` |
| `loadClubOfficer(slug, viewerId, { channelId?, allowed? })` | the front door of every room-management route: owner/admin, 404 for a stranger on a hidden club; loads the room with its `kind` | `src/lib/club-routes/officer-guard.ts:75-158` |
| `isCoreRoomKind`, `isCoreRoomName` | board / lounge / officers are locked names | `officer-guard.ts:41-48` |
| `blockedIdsFor(client, viewerId)` | the viewer's block set, club rooms only | `src/lib/chat/blocks.ts:21-36` |
| types | `RoomKind`, `Room`, `ViewerInRoom`, `SpaceRoom { id, kind, name, unread, can_post, event }`, `SpaceResponse`, `RefusalCode` + `REFUSAL_SENTENCES` | `src/lib/chat/types.ts:22, 56-62, 64-73, 415-422, 425-442, 83-103, 123` |

### 1.4 Routes for rooms (all exist today; none is gated by `chat_v2` except `space`)

| Route | Who | What | Where |
|---|---|---|---|
| `GET /api/orgs/[slug]/space` | member, `chat_v2` on | club, viewer role, `rooms: SpaceRoom[]` (cookie read, so RLS hides rooms I cannot enter), `board_latest`, `up_next` | `src/app/api/orgs/[slug]/space/route.ts:92-271`; rooms select at :151 |
| `GET /api/orgs/[slug]/channels` | member | the old list: `id, name, topic, is_private, pinned, position, created_at, parent_channel_id, kind`, event rooms left out | `channels/route.ts:41-126` (:14, :105) |
| `POST /api/orgs/[slug]/channels` | owner/admin, may publish | creates an extra room. Body `{ name, topic?, is_private?, position? }`. Always `kind: 'room'`. Name must match `^[a-z0-9][a-z0-9_-]{1,30}$`. `board`/`lounge`/`officers` → 409 `room_locked`. **No cap, no rate limit** | `channels/route.ts:148-254` (:11, :145, :215-217, :237) |
| `PATCH /api/orgs/[slug]/channels/[channelId]` | owner/admin, not restricted | `{ name?, topic?, is_private?, position?, pinned? }`. Core rooms: name and privacy locked, topic allowed. Event room: all refused. | `channels/[channelId]/route.ts:70-202` |
| `DELETE /api/orgs/[slug]/channels/[channelId]` | owner/admin | only `kind = 'room'`; messages cascade | same file :214-234 |
| `GET …/channels/[channelId]/members` | owner/admin | the allow list with name, handle, avatar | `channels/[channelId]/members/route.ts:48-93` |
| `POST …/channels/[channelId]/members` | owner/admin, not restricted | `{ user_id }` or `{ handle }`; target must be a club member; refused (409 `room_locked`) on board, lounge, event; **allowed on officers and room** | same file :106-201 (:122-125) |
| `DELETE …/members/[userId]` | owner/admin | removes one allow-list row | `members/[userId]/route.ts:16-47` |
| `POST …/channels/reorder`, `POST …/channels/subscribe-public` | old screens | reorder; re-add my rows on public rooms | `channels/reorder/route.ts`, `channels/subscribe-public/route.ts:24-60` |
| `POST /api/me/threads/[id]/read` | anyone | updates MY `channel_members.last_read_at`; a no-op where I hold no row (Officers, private rooms) | `src/app/api/me/threads/[id]/read/route.ts:8-30` |

### 1.5 Screens that show, create or edit rooms today

**Phone, new chat (`src/components/mobile/messages/club/`).** Shows rooms, cannot manage them.
- `RoomChips({ clubName, rooms, activeRoomId, night, now, onPick })`: one chip per `SpaceRoom` in the server's order. The lock icon is drawn ONLY for `kind === "officers"`; the calendar icon for `event`; the unread dot ONLY for the Board (`RoomChips.tsx:81-82`). An extra room's chip is its raw name, no icon (`helpers.ts:78-92`). `aria-label` for Officers: "Officers, only officers see this room" (`helpers.ts:98-99`).
- `ClubSpace` picks any non-event room into the same thread view (`ClubSpace.tsx:393-406`), so an extra room and the Officers room already open and work.
- When you cannot post: `RoomComposer` draws a quiet tile in the composer's place. Two sentences exist: the Board's "Only officers post on the Board. You can reply to any post." and "This chat is closed." for everything else (`RoomComposer.tsx:173-178`). There is no sentence for "only some people post here".
- No "new room", "add people" or "room settings" screen: a grep of `src/components/mobile/messages` for `/channels`, `is_private`, `org_channel_members` finds nothing; the only `/api/orgs/` calls are the two `space` reads (`ClubSpace.tsx:247`, `compose/ShareEventSheet.tsx:66`).

**Old desktop, Campus > Chat (`src/app/campus/campus-home.tsx`, 17k lines; all of these are private functions of that file, not exported).**
- `CreateChannelModal` (:1444-1560): name, topic, Public ("All members can view") or Private ("Owner / admin only"). Posts to `POST …/channels` (:1464-1472). Opened from the rail's "+" (:15761) via `showCreateChannel` (:508, :1041-1047).
- `ChannelSettingsModal` (:3223-3347): tabs Overview (name, topic, privacy, order: `ChannelOverview` :3351), **Access** (only when the room is private, the viewer is owner/admin and it is not an event room, :3247), Danger (delete; hidden for core rooms and event rooms, :3248).
- `ChannelAccess` (:3582-3700): lists the allow list, adds a person by @handle (`POST …/members`, :3626-3632), removes one (`DELETE …/members/<id>`, :3653-3656). This is how people are added to the Officers room and to a private room today.
- `OrgSettingsModal` (:1575) has a Channels tab too (mounted at :1050-1062).
- The old composer's refusal line: Board → "Only officers post here.", else "This chat is closed." (:16736-16757).

**Club page.** `ChannelsSection` lists a member's rooms (public and private groups, :120-122) and links each to `/campus?tab=chat&org=&channel=` (`src/app/orgs/[handle]/ChannelsSection.tsx:47, :317`); "+ Join all public" calls `subscribe-public` (:95, :179).

**Old Messages page.** `public/html/messages.html` lists club rooms the viewer holds a `channel_members` row on (so never the Officers room or a private room: the thread list is built from those rows, `src/app/api/me/threads/route.ts:483-487`).

### 1.6 The six questions, answered

1. **Can a club have extra rooms today, who creates them, where?** Yes. `kind = 'room'`, any number (no cap: `channels/route.ts:145`). Owner or admin only (`loadClubOfficer`, `channels/route.ts:186-189`). The only screen is old desktop's `CreateChannelModal` (`campus-home.tsx:1444`). Production had exactly one on Sept 29: SAE's `events` room (A:101-102).
2. **Can a room be visible to only some members?** Yes. `is_private = true` plus rows in `org_channel_members`; owners and admins always see it (A:1335-1340). Edited on old desktop's Access tab (`campus-home.tsx:3582`) through the three `…/members` routes. Nowhere on the phone.
3. **Read by many, posted in by only some?** No. Only the Board has that rule (A:1376-1383). For lounge, officers and room the rule is "can see = can post" (A:1389). No column, table or route says otherwise.
4. **Who is in the Officers room, how are people added?** Every current owner and admin, automatically. Plus anyone an owner/admin added by name through the same allow list (the members POST allows `officers`, `members/route.ts:117-125`). Mods are NOT in unless added by name (`20260507140000`:1-8). Nobody holds a `channel_members` row there (A:940), so it has no unread signal. A demoted officer who was also added by name stays in (A:62-64).
5. **What does the phone show per kind, and when you cannot post?** Chips in this order: Lounge, Board (dot when unread), Officers (lock; only if I can enter), open event chats (calendar icon; they open as their own layer), then extra rooms by position (plain name, no lock even when private). Cannot post → the quiet tile: the Board sentence on a Board, "This chat is closed." anywhere else (`RoomComposer.tsx:173-178`). The server's `viewer.can_post` (the database's answer) decides.
6. **What is missing for "only certain people can type and view"?** View is done. Type is missing. See 3.2 for the smallest change: `channels.post_policy`.

### 1.7 The ground for pinned messages

**`public.messages` columns** (all exist; "Shared" needs no new field):

| Column | Meaning | Where |
|---|---|---|
| `id, channel_id, user_id, content, created_at` | the message; `channel_id` and `user_id` cascade on delete | phase1:113-119 |
| `media_url`, `media_kind` (`image` / `video`) | a photo or video uploaded for this message; an R2 key under `messages/<channel id>/`. Never sent raw: the client gets the same-origin proxy URL | `20260505200000_message_media.sql:6-14`; `src/lib/messages/channel-access.ts:183`; `src/lib/chat/message-read.ts:236-242` |
| `attachment_kind` (`post` / `clip`), `attachment_id` → `posts.id` ON DELETE SET NULL | a shared post. A deleted post leaves `attachment_id` null and `attachment_kind` set ("Post unavailable") | `20260505180000_message_attachments.sql:9-25` |
| `parent_message_id` (SET NULL) | the quoted message of a reply | `20260508150000_message_reactions_and_replies.sql:61-63` |
| `removed_at`, `removed_by`, `removed_reason` | a soft removal | `20260923090000_moderation_foundation.sql:2144-2147` |
| `kind` (`text` / `poll` / `event_card`), `thread_root_id` (CASCADE), `card_event_id` | cards and Board replies; always `text` and null in a dm or group (A:1425) | A:711-714 |

The read's column list and joins: `MESSAGE_SELECT` (`message-read.ts:71-85`); the shared post's join shape is `AttachmentRow` (`message-read.ts:124-132`). Club rooms hold no photos or videos in v1 (A:1413), so "Shared" is a dm / group thing.

**Three ways a message goes away, and what the pin should do:**
1. **The sender deletes it**: a HARD delete, allowed by RLS `messages_delete_own` (`20260509100000_message_delete_and_clear.sql:16-19`), route `DELETE /api/me/threads/[id]/messages/[messageId]` (`…/[messageId]/route.ts:98-109`). A pin row with `ON DELETE CASCADE` on `message_id` goes with it. Nothing to write.
2. **An officer or mod removes it**: a SOFT removal (`removed_at`, reason "Removed by a club officer."), club rooms only; a dm or group answers 403 `not_allowed` (`…/[messageId]/route.ts:116, 183-206`). Who did it goes to `chat_removals` (B:649-656). Not reachable for a dm / group pin.
3. **A Vibe moderator removes it**: a SOFT removal of any message, dm and group included (`src/lib/moderation/actions.ts:708-760`), and can restore it (`:809-845`). After it, RLS hides the row from everyone but its author (`20260923090000`:2232-2241). **This is the case a pin must handle**: the row still exists, so a cascade does nothing.
Also: **"Clear chat history"** is per viewer (`channel_members.cleared_at`; the read filters `created_at > cleared_at`, `message-read.ts:850, 857`): a pin list must apply the same filter for that viewer. **Leaving a group / deleting an account**: `channel_members` and `users` cascades; `pinned_by` should be SET NULL.

**Blocks.**
- dm and group: a block either way between the sender and ANY other member of the chat refuses the send, in the policy (A:1433-1439) and in the route (`dmSendBlocked`, `src/app/api/me/threads/[id]/messages/route.ts:426-446`; `src/lib/safety/pair-block.ts`). Reading is not changed: old messages stay readable, nothing is hidden (`ChatMessage.hidden` is "always false in a dm or a group", `src/lib/chat/types.ts:311`). Hiding blocked people inside group chats is an accepted after-launch item (contract 14.42, `wave-2-contracts.md:26`).
- club rooms: a blocked person's rows arrive as stubs, both ways (`message-read.ts:585-650`). Not relevant to pins in this build (pins are dm / group only).

**Things already called "pin" (the names to stay away from):**
- `channel_members.pinned_at` + index `idx_channel_members_pinned`: MY pinned chats (`20260505140000_dm_pin.sql:4-10`).
- `POST /api/me/threads/[id]/pin` (body `{ pinned }`): pin a CHAT to the top (`src/app/api/me/threads/[id]/pin/route.ts:13-61`).
- `ThreadEntry.pinned_at`, `InboxClub.pinned_at` (`types.ts:397`), the sort in the thread list (`src/app/api/me/threads/route.ts:847-848`).
- Phone: "Pin to top" / "Unpin" in the chat's "..." sheet (`ConversationActionSheet.tsx:55-77, 278-280`). Old desktop: `__dmTogglePinCurrent` in the info panel (`public/html/messages.html:3080, 3263`).
- `channels.pinned` + `channels_org_pinned_position_idx`: a club channel pinned in the old rail (`20260507130000`:17-21); the PATCH body's `pinned` (`channels/[channelId]/route.ts:164-166`); "📌 Pinned" (`campus-home.tsx:3291`).
- `keepPinnedToBottom`: a scroll helper, unrelated (`ConversationView.tsx:227`).
- The slim list's "Pinned and unread chats" on the approved board is the first of these (pinned CHATS).
Nothing named `chat_message_pins`, `message_pins`, `pin_` or `/pins` exists (grep of `supabase/migrations`, `src`, `public/html`).

**Limits and the rate limiter.** `rateLimit(key, { limit, windowSec, failClosed? })` then `if (!rl.allowed) return tooManyRequests(rl)` (`src/lib/rate-limit.ts:25-50, 133`). Keys in use: `message-send:<user>` 60 per 60 s (`messages/route.ts:259`, also the cards route), `message-remove:<user>` 30 per 600 s (`[messageId]/route.ts:120`), `card-vote:<user>` 120 per 600 s, `thread-create:<user>` 30 per 600 s (`threads/route.ts:230`). Message text max 4,000 (`messages/route.ts:45`); a thread page is 50, max 200 (`message-read.ts:345-346`). There is no per-chat cap on anything today.

**Migration conventions (read from A, B, C).**
- Name: `supabase/migrations/YYYYMMDDHHMMSS_snake_case.sql`. The last one is `20261001120000`. A new one must sort after it.
- Header, as comments: WHY THIS EXISTS, WHAT IT DOES (numbered), DOES NOT, LIVE STATE, PRE-CHECK (read-only queries with expected answers), APPLY ORDER, CHECK AFTER APPLYING, ROLLBACK (the exact statements) (C:1-140).
- Body: `begin;` + `set local lock_timeout = '5s';` (C:143-147, A:388-394) → a PRE-FLIGHT `do $$` block that raises on "already applied", on a taken name, and on a drifted function (by `md5(pg_get_functiondef(oid))`) or policy text (A:420-544) → the statements → POST-CHECK by catalog (C:232-268) → POST-CHECK BY BEHAVIOUR in a nested block that raises its own SQLSTATE to roll itself back (P0C29 in B, P0C39 in C) → `notify pgrst, 'reload schema';` → `commit;` (A:1962-1964).
- New table: every constraint named; RLS on with NO policy; `revoke all on table … from anon, authenticated, service_role` then `grant select, insert, update, delete … to service_role`; a comment (B:609-691). A TABLE revoke is fine.
- Functions: **never leave a public function without EXECUTE for anon or authenticated** (a refused call crashes this Postgres image: `20260922090000_guard_function_privileges.sql:48-52`). Pattern: `revoke all … from public` then `grant execute … to anon, authenticated, service_role` (C:227-228), and refuse inside: `if current_setting('role', true) in ('anon','authenticated') then raise exception 'not allowed' using errcode = '42501'` (A:1211-1213). A trigger function needs no grant (B:34-35; it is not reachable over REST).
- A restated function: PRE-FLIGHT pins the old md5, the header records the new one (A:69-75).
- Local apply (psql is not on the Mac): `docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql` (C:117; audit F23, `handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md:1172-1183`). Never `supabase db push` (same audit, :169). Production later: the Management API curl recipe (`20260926100000_users_profile_layout.sql:76-78`) plus the `schema_migrations` row.
- Behaviour scripts live in `scripts/sql/` (`chat-v2-rooms-check.sql`, `chat-v2-cards-check.sql`, `chat-latest-check.sql`, `chat-v2-after-deploy.sql`).
- Code ships before the migration on production: every read of a new column, table or function must fall back when `isMissingChatSchema(error)` (`src/lib/chat/schema.ts:40-58`).

**Where the actions would live.**
- Phone long-press sheet: `ReactionPicker` takes `onPick, onReply?, onReport?, onRemove?, onClose` and draws Reply / Report / Remove as rows only when the prop is passed (`ReactionPicker.tsx:36-59, 182-235`). `MessageBubble` passes them through (`MessageBubble.tsx:23-25, 766-800`). The visible "..." button shows on other people's messages only (`MessageBubble.tsx:565`); your own message opens the sheet by long-press.
- Phone chat info: `ConversationActionSheet` rows (`:269-354`): View profile, Group info, Pin to top, Mute, Clear chat history, Leave, Report, Block, Delete conversation. `GroupSettingsView` (photo, name, members, leave; `:14, :438, :491`).
- `ConversationView` is the ONE dm / group view for flag-on phones (`MessagesMobile.tsx:552`, inside `MessagesMobileV2` :213), flag-off phones (`:925`, inside `MessagesMobileV1` :576) and old Campus (`CampusMobile.tsx:1089`). It does not know the flag. It loads the newest 50 messages once, has no "earlier" button and no timer (`ConversationView.tsx:165`).
- Old desktop thread: the hover pill `actionsFor(m)` = five emojis, Reply, Report, and Delete on your own message (`public/html/messages.html:1376-1401`). Photo, video and shared-post rows get only a Report pill, and your own ones get no pill at all (`:1361-1371`). The info panel is `#cPanel` (`:1083`, `__dmPanelRender` :2986). It loads `?limit=50` (`:2372`), never pages back, and its bubbles carry no message id in the markup (`:1520`).

---

## 2. Reusable on desktop AS IS

| Piece | Why it is safe |
|---|---|
| `GET /api/orgs/[slug]/space` for the chips | Already returns EVERY room the viewer may enter, extra rooms and Officers included, because the rooms read runs on the cookie client behind `can_view_org_channel` (`space/route.ts:147-151`). Not device-shaped. Needs two more fields (3.1), nothing removed. |
| `can_view_org_channel`, `messages_select_org_member`, `channels_select_org_member` | "Visible to only some members" is already enforced in the database for reads, direct PostgREST included (A:1319-1344). Desktop adds no rule. |
| The whole thread stack for any room kind: `ensureMember`, `loadRoom`, `canPostAnswer`, `describeRoom`, `viewerInRoom`, `useRoomPoll` | Kind-agnostic. An extra room and the Officers room already open on the phone through them (`ClubSpace.tsx:393-406`). `viewer.can_post` is the database's answer (`message-read.ts:1150-1166`), so a new posting rule shows up with no screen change. |
| `RoomChips` | Pure, takes `SpaceRoom[]`, no vaul, no history. Needs a small change for the lock and megaphone (3.1), not a twin. |
| `RoomComposer`'s quiet tile | Already replaces the composer when `viewer.can_post` is false (`RoomComposer.tsx:173-178`). Needs one more sentence (3.1). |
| The six room-management routes (`POST / PATCH / DELETE …/channels`, `GET / POST / DELETE …/members`) | Complete, officer-gated with `loadClubOfficer`, service-role writes, word filter, core rooms locked. The desktop "Manage rooms" door can call them unchanged for: create a room, rename, topic, public / private, delete, add and remove people. `PATCH` only needs to accept the new `post_policy` (3.2). |
| `loadClubOfficer`, `isCoreRoomKind`, `isCoreRoomName` | The one officer rule; reuse for any new room route. |
| The triggers and `chat_repair_club` | Membership rows follow privacy flips and joins by themselves (A:904-963, A:973-1044). Room management needs no row bookkeeping in the app. |
| `rateLimit` / `tooManyRequests`, `requireNotRestricted`, `requireCanPublish`, `refusalBody` | The gates every new pin route should reuse, in the order the remove route uses them (`[messageId]/route.ts:112-123`). |
| `dmSendBlocked(supabase, channelId, userId)` | The dm / group block answer the send route already trusts (`messages/route.ts:431-446`); the same call decides whether a pin is allowed. |
| `messageMediaProxyUrl(channelId, messageId)` and the media route | "Shared" thumbnails are the same proxy URLs the thread uses (`channel-access.ts:183`). |
| `MESSAGE_SELECT` / `AttachmentRow` | The shared-post join for "Shared" is already written (`message-read.ts:71-85, 124-132`). |
| `ReactionPicker`'s optional-row pattern | A new optional `onPin` prop draws nothing when absent, so every screen that does not pass it is unchanged (the `onRemove` precedent, `ReactionPicker.tsx:55-57, 221-235`). |
| `GET /api/orgs/[slug]/members` | Any member reads the roster (`user_id, role, name, handle, avatar_url`), so a "pick people" list for a room needs no new route (`src/app/api/orgs/[slug]/members/route.ts:9-13, 124`). |

---

## 3. Phone-shaped or missing: what needs a desktop twin or a change, and the smallest way

### 3.1 Showing every room on desktop (display)

| Need (point 11) | Today | Smallest way |
|---|---|---|
| A lock on every restricted room, not only Officers | `RoomChips` draws the lock for `kind === "officers"` only (`RoomChips.tsx:81`); `SpaceRoom` has no privacy field (`types.ts:415-422`) | Add `locked: boolean` to `SpaceRoom` (= `channels.is_private`; true for officers, event and private rooms; event chips keep the calendar icon). The space route adds `is_private` to its select (`space/route.ts:151`). `RoomChips`: lock when `room.locked && room.kind !== "event"`. `aria-label` for a private room: `<name>, only some members see this room`. |
| The megaphone on the Board chip | no icon on the Board chip | A `MegaphoneIcon` beside `LockIcon` in `RoomChips.tsx`, drawn for `kind === "board"`. It is one shared component, so the phone's new chat gets it too (allowed: only `chat_v2` people see `RoomChips`). See open question 6.5. |
| A room you can see but not post in shows who can post | Two sentences only: the Board one and "This chat is closed." (`RoomComposer.tsx:173-178`) | A third `ClosedTile` text chosen from the room's posting rule (3.2): `Only officers can post here.` / `Only officers and people they picked can post here.` The rule reaches the screen as a new `SpaceRoom.post_policy` (the active room IS a `SpaceRoom`), so the thread GET does not change. |
| `can_post` right for an extra room | `spaceCanPost` and the thread list answer `true` for every non-Board, non-event room (`reads.ts:175-179`, `threads/route.ts:815-817`) | `spaceCanPost(kind, role, state, policy, listed)`: for `kind === "room"`: `everyone` → true; `officers` → role is owner/admin; `listed` → owner/admin or `listed`. The route reads the viewer's own `org_channel_members` rows on the club's rooms in one cookie read (the SELECT policy lets a person read their own rows, `20260507130000`:39-51). The thread GET's `viewer.can_post` (the database) still wins on the open room. |
| The refusal after a send the database refused | `postRefusal` answers `room_closed` for any non-Board room (`room-rules.ts:124-125`) | One new `RefusalCode`, `room_posters_only` ("Only some people can post here."), picked when `room.kind === "room"` and `room.post_policy !== "everyone"`. `Room` gains `post_policy` (`types.ts:56-62`; `loadRoom` select, `rooms.ts:138`, with the missing-column fallback). |
| The Board reads as announcements | Chip says "Board"; members see "Only officers post on the Board. You can reply to any post."; officers see "Everyone in <club> sees this" above the composer (`RoomComposer.tsx:176, 283`) | Desktop club panel section titled `Announcements` with the megaphone (another reader maps the panel). In the Board room on desktop, one line under the header: `Announcements from <club>'s officers. Everyone in the club sees them.` Keep the word "Board" on the chip (it is the product's noun everywhere: `clubRoomLabel`, `room-rules.ts:87`). |
| Unread on Officers and private rooms | Never (no `channel_members` rows there, A:940; accepted gap 14.36) | Leave as is in this build and say so. Fixing it means rows for those viewers plus trigger changes: not needed by point 11. See open question 6.4. |

### 3.2 The data-model change for "who can post" (the one gap)

**Recommended: one column on `channels`, no new table.**

```sql
alter table public.channels
  add column post_policy text not null default 'everyone',
  add constraint channels_post_policy_check
    check (post_policy in ('everyone', 'officers', 'listed')),
  add constraint channels_post_policy_rooms_only
    check (post_policy = 'everyone' or coalesce(kind = 'room', false));
```

- `everyone`: today's rule (everyone who can see the room posts). Every existing row.
- `officers`: only the club's owners and admins post (the Board's list, `BOARD_POSTER_ROLES`). Everyone who can see it reads.
- `listed`: owners and admins, plus the people on the room's list (`org_channel_members`). In a PUBLIC room this is "everyone reads, the picked people post". In a PRIVATE room the list is already who can see it, so `listed` equals `everyone` there: the screen offers only "Everyone in the room" and "Officers only" for a private room.
- Only extra rooms carry a rule (the second CHECK). The Board keeps its own rule (officers post, members reply); Lounge, Officers and event rooms stay as they are.
- A constant default means no table rewrite (the note at A:705-707), but `ADD COLUMN` + `ADD CONSTRAINT` take ACCESS EXCLUSIVE on `channels` until commit: a quiet-hour apply on production, like A (A:194-199).

**The rule, in `can_post_org_channel`** (restated whole; PRE-FLIGHT pins today's md5 `8d8be860d3f7077b9d6f9238705bdca7`, A:73-75). Two new arms right before the last "lounge, officers, room → true" arm (A:1389). They sit after `when root is not null then false` (A:1384), so there are no replies in these rooms:

```sql
when c.kind = 'room' and c.post_policy = 'officers' then
  coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
when c.kind = 'room' and c.post_policy = 'listed' then
  coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
  or exists (select 1 from public.org_channel_members ocm
              where ocm.channel_id = c.id and ocm.user_id = uid)
```

Because `messages_insert_org_member` (A:1409-1418) and both card functions (B:738) already ask this function, direct PostgREST writes and cards are walled with no policy change.

**One more function must be restated in the same file: `chat_cast_vote`.** Today a vote is refused as "closed" when the room is not a Board and the voter cannot post there (B:867-868). In an `officers` or `listed` room that would stop members from voting on a poll an officer posted. Change the test from `v_kind <> 'board' and not can_post…` to `v_kind = 'event' and not can_post…`: identical for every room that exists today (only an event room ever says no to a viewer), and it lets readers vote in a post-restricted room. PRE-FLIGHT pins its current md5 (one of "the five own-function md5s" B records, B:1213-1223; read it from the local stack).

**Routes.**
- `POST /api/orgs/[slug]/channels`: accept `post_policy?` (default `everyone`); insert it only when the column exists (the `insertRoom(withKind)` fallback pattern, `channels/route.ts:227-248`).
- `PATCH …/channels/[channelId]`: accept `post_policy?`; refused with 409 `room_locked` unless `kind === "room"`; refuse `listed` together with `is_private: true`? No: allow it, it simply equals `everyone` there.
- `GET …/channels` and `GET …/space`: return `post_policy` (and `locked`), read with the missing-column fallback.
- `POST …/members` on a public room now has a meaning (a poster under `listed`); it is already allowed for `kind === "room"` (`members/route.ts:122-125`). No change.
- No new route for rooms.

**App-side copies to update together:** `Room` + `loadRoom`, `SpaceRoom` + the space route, `spaceCanPost`, the thread list's `can_post` (`threads/route.ts:815-817`), `postRefusal` + `RefusalCode` + `REFUSAL_SENTENCES`, `RoomComposer`'s tile, `RoomChips`, `helpers.ts` labels, and the `GuardedChannel` type if PATCH needs the old value (`officer-guard.ts:51-63`).

**The alternative, if named posters are not wanted now:** the same column with two values (`everyone`, `officers`). Same migration size; drops one arm and one screen option. A third option, a per-person flag (`org_channel_members.can_post`), is only needed for "a private room where some listed people read only": not asked for; leave it out.

### 3.3 The door to manage rooms on desktop

- **Do not reuse old desktop's modals.** `CreateChannelModal`, `ChannelSettingsModal`, `ChannelAccess` are private functions inside `campus-home.tsx` (:1444, :3223, :3582), styled with that file's dark-glass constants and worded "channel", "#name", "Owner / admin only". Exporting them drags the 17k-line file into the Messages bundle.
- **Smallest way:** one new desktop component (for example `src/components/desktop/messages/ManageRooms.tsx`), a centred dialog opened from the club panel's "Manage club" area or a "+" at the end of the chips, officers only (`space.viewer.role` is owner or admin). It lists the club's rooms from `GET …/channels` (officers see every room; event rooms are left out by the route, `channels/route.ts:105`) and offers, per extra room: name, what it is for (topic), **Who can see it** (Everyone in the club / Only people you pick, plus officers), **Who can post** (3.2), the people list (`GET / POST / DELETE …/members`, picked from `GET …/members`), delete. For the Officers room: the people list only (its name and privacy are locked, `channels/[channelId]/route.ts:101-104`). Board and Lounge: listed, not editable.
- Everything it calls exists except `post_policy`. Behind the desktop switch. The phone gets no manage screen in this build (point 11 asks for a desktop door).
- After a save, re-read `space` so the chips follow (the phone re-reads every 20 s, `ClubSpace.tsx:95`).

### 3.4 Pinned messages: the smallest design (data and routes)

**Table (service role only, the `chat_removals` pattern, B:649-680):**

```sql
create table public.chat_message_pins (
  message_id uuid constraint chat_message_pins_pkey primary key
             constraint chat_message_pins_message_id_fkey references public.messages(id) on delete cascade,
  channel_id uuid not null
             constraint chat_message_pins_channel_id_fkey references public.channels(id) on delete cascade,
  pinned_by  uuid constraint chat_message_pins_pinned_by_fkey references public.users(id) on delete set null,
  pinned_at  timestamptz not null default now()
);
create index idx_chat_message_pins_channel   on public.chat_message_pins (channel_id, pinned_at desc);
create index idx_chat_message_pins_pinned_by on public.chat_message_pins (pinned_by);
alter table public.chat_message_pins enable row level security;          -- and NO policy
revoke all on table public.chat_message_pins from anon, authenticated, service_role;
grant select, insert, update, delete on table public.chat_message_pins to service_role;
```

- One row per message (the primary key): a message is pinned or not, for everyone in the chat. Pinning an already pinned message is a no-op.
- `message_id … on delete cascade`: the sender's own delete (a hard delete) drops the pin by itself. So does deleting the chat (`channel_id`) and deleting an account that wrote the message (`messages.user_id` cascades).
- `pinned_by … set null`: the pin outlives the person who pinned it; the panel shows the message's author and date, as the board draws it ("Maya R. · Sep 30"), not who pinned.
- No client grant, no policy: the routes do every read and write with the service role AFTER their own gates. Nothing new is reachable over PostgREST, so no new access rule can be wrong.

**A removed message drops its pin: one trigger.** A Vibe moderator's removal is a soft one (`moderation/actions.ts:708-760`), so no cascade fires. Add `chat_pins_drop_removed()` (plpgsql, SECURITY DEFINER, `search_path ''`, swallows its own error like A's triggers, A:858-860) as `AFTER UPDATE OF removed_at ON public.messages FOR EACH ROW WHEN (new.removed_at is not null and old.removed_at is null)`: `delete from public.chat_message_pins where message_id = new.id`. A later restore does not bring the pin back. The list route also filters `removed_at is null` (belt and braces). A trigger function needs no grant (B:34-35).

**Routes (three; all need: signed in, the pins switch on for the caller, `ensureMember` ok and `isOrgChannel === false`, else 404 / 403):**

| Route | Body → answer | Rules |
|---|---|---|
| `GET /api/me/threads/[id]/message-pins` | → `{ ok: true, pins: PinnedMessage[], cap: 20 }`, newest pin first. `PinnedMessage = { message_id, pinned_at, created_at, text, author: Person \| null, media_kind: "image" \| "video" \| null, has_post: boolean }` | Service read of the pin rows for `[id]`, joined to their messages; drop rows with `removed_at` set and rows at or before the viewer's `cleared_at` (`ensureMember` returns it, `channel-access.ts:20-25`). `text` = the first 140 characters of `content`. Read-only: no rate limit (the `/api/me/features` precedent). |
| `PUT /api/me/threads/[id]/messages/[messageId]/pin` | no body → `{ ok: true, pinned: true, already?: true }` | In order: `rateLimit("message-pin:<user>", { limit: 30, windowSec: 600 })`; `requireNotRestricted`; the caller's `accepted_at` is not null (a pending message request cannot pin: 403); `dmSendBlocked` false (a blocked pair cannot pin, the same answer the send gives, `messages/route.ts:431-446`); the message is read on the COOKIE client with `.eq("id").eq("channel_id")` (RLS proves the caller can see it and it is not removed; none → 404 `not_found`); not older than the caller's `cleared_at`; count of pins in the chat < 20, else 409 `pin_limit`; service insert `(message_id, channel_id, pinned_by)`, a duplicate key = `already`. |
| `DELETE /api/me/threads/[id]/messages/[messageId]/pin` | → `{ ok: true, pinned: false }` | Same gates minus the block check, the cap and the cookie read (anyone in the chat may unpin, and an unpin must still work for a message the caller can no longer read); service delete scoped to `message_id` AND `channel_id`. Zero rows is still ok. |

- The route folder already holds `route.ts` (DELETE a message), `react/` and `media/` under `[messageId]` (`src/app/api/me/threads/[id]/messages/[messageId]/`): `pin/route.ts` sits beside them.
- The list path is `message-pins`, NOT `pins`: `/api/me/threads/[id]/pin` already exists and pins the CHAT (`pin/route.ts:13`). One letter apart would be a trap.
- Club rooms answer 400 with a new code (for example `pins_chats_only`), the shape of `cards_club_rooms_only` (`types.ts:100`). The table itself allows any channel, so pins in club rooms later need no migration.
- New `RefusalCode`s: `pin_limit` ("This chat already has 20 pinned messages. Unpin one first."), `pins_chats_only`. `REFUSAL_SENTENCES` is a `Record<RefusalCode, string>` (`types.ts:123`), so each new code needs its sentence or the build fails.
- **The cap: 20 per chat**, enforced by a count in the PUT route. Two people pinning the 20th at the same moment can leave 21: harmless, and not worth a lock. 20 keeps the panel one short list with no paging.
- On a database without the table every route answers 404 `not_found` (`isMissingChatSchema`), and the screens hide Pin when the list read answers 404.
- The thread GET does NOT change. A screen learns which messages are pinned from the list (at most 20 ids) and labels its button Pin or Unpin from that set. `message-read.ts` and its tests stay untouched.

**"Shared": one read of rows that exist, no new field.**
- `GET /api/me/threads/[id]/shared?before=<iso>&limit=<1..60, default 30>` → `{ ok: true, items: SharedItem[] }`, newest first. `SharedItem = { message_id, created_at, user_id, media_url: string | null (the proxy URL), media_kind, attachment: AttachmentRow | null }`.
- The query, on the COOKIE client (RLS `messages_select_member` already limits it to chats the caller is in and hides removed rows from non-authors): `messages` where `channel_id = [id]` and (`media_url is not null` or `attachment_id is not null`) and `removed_at is null` and `created_at > cleared_at` (when set), `order by created_at desc`, with the `MESSAGE_SELECT` joins for the shared post. PostgREST: `.or("media_url.not.is.null,attachment_id.not.is.null")`.
- A shared post that was deleted has `attachment_id` null (FK SET NULL) and falls out by itself. A post the viewer may not read (blocked author, removed) comes back with `attachment: null`: skip it.
- `media_url` is rewritten with `messageMediaProxyUrl` (never the stored key), as `prepareForClient` does (`message-read.ts:236-242`).
- Served by the existing index `idx_messages_channel_created (channel_id, created_at desc)` (C:60-62): it walks one chat's rows. Fine for a dm or group; no new index.
- It could be a `?shared=1` mode of the thread GET instead of a new route. A separate route is cleaner: the thread GET's answer is pinned by tests and read by `messages.html`.

**Migration set (local only, written in the repo's style, section 1.7):** one file for pins (`…_chat_message_pins.sql`: the table, the indexes, the trigger function and trigger; PRE-FLIGHT: names free, `messages.removed_at` exists, the set of triggers on `messages` is the one read; POST-CHECK by catalog and a behaviour probe that pins, soft-removes, checks the pin is gone and rolls itself back with its own SQLSTATE). One file for rooms (`…_chat_room_post_policy.sql`: the column, two CHECKs, `can_post_org_channel` and `chat_cast_vote` restated with md5 pre-flights, a behaviour probe per policy). Two files, so either can be applied or rolled back without the other.

### 3.5 Pinned and Shared on the screens

**Desktop (the approved picture: a right panel beside a dm, opened from the header).**
- The panel is new React (desktop only): header button → `GET …/message-pins` and `GET …/shared`; re-read on open, after the viewer's own pin or unpin, and every 20 s while open.
- The dm / group thread on desktop is `messages.html` in a thread-only frame (point 6). So the Pin button in the hover toolbar is built INSIDE `messages.html`: add it to `actionsFor(m)` (`:1376-1401`) beside Reply, and give photo, video and shared-post rows a pill too (today your own media rows have none, `:1361-1371`), or those can never be pinned from a laptop. Draw it only in the desktop pane mode AND when the list read did not answer 404.
- The frame and the panel must talk. `messages.html` already posts to its parent (`:1124`). Two messages are needed: frame → parent `{ source: "vibe-chat", type: "pins-changed", channel }` after a pin or unpin, and parent → frame `{ type: "jump-to-message", id }` when a pin is clicked.
- "Clicking one jumps to that message" needs two things the old page lacks: a message id on each bubble in the markup (none today, `:1520`), and an answer for a message older than the 50 it loads (`:2372`, no paging). Smallest: add `data-mid`, scroll and flash when the message is in the loaded 50; otherwise say "That message is further back in the chat." Loading older pages in `messages.html` is its own piece of work.

**Phone (only where `chat_v2` is on for the person).**
- `ConversationView` gets one new optional prop (for example `messagePins?: boolean`), passed as `true` only from `MessagesMobileV2` (`MessagesMobile.tsx:552`), never from `MessagesMobileV1` (`:925`) or `CampusMobile` (`:1089`). Off or absent: byte-for-byte today's screen.
- Long-press sheet: `ReactionPicker` gets an optional `onPin` + label (`Pin message` / `Unpin message`), drawn as a row like Report (`ReactionPicker.tsx:207-220`). `MessageBubble` passes it through like `onRemove` (`MessageBubble.tsx:794-800`). Not on a `temp_` message, not in a club room.
- Chat info: one new `SheetRow` "Pinned messages" in `ConversationActionSheet` (dm and group, not `clubRoom`), beside "Pin to top" (`:278-280`). It opens a small list (a new sheet built on `sheets.tsx` / `sheet-styles.ts`): each pin as a quote with author and date; tap → close and scroll to the message when it is among the loaded 50 (`ConversationView.tsx:165`), else the same "further back" line. `MessageBubble`'s wrapper needs a `data-mid` or a ref map for the scroll.
- The phone does not get "Shared" in this build (point 10 asks for Pin / Unpin and a Pinned list on the phone).
- Words: the chat-level row stays "Pin to top"; the message-level action is always "Pin message" / "Unpin message"; the list is "Pinned messages". Never a bare "Pin" on the phone, where both live in the same view.

---

## 4. Contracts the desktop build must not break

**Database.**
- The six CHECKs on `channels` (A:826-838): a Board and a Lounge are public, Officers and event rooms are private, `kind` is set exactly for `org_channel`, an event room has its `event_id`. A new column must not weaken any of them. `channels_one_core_room` (A:718-719) stays.
- `can_view_org_channel` is NOT touched by this build. Its md5 stays `747ee06d2e4c3e8a788129f7530ec0ae` (A:72-73).
- `can_post_org_channel(uuid, uuid, uuid)` keeps its signature, STABLE, SECURITY DEFINER, `search_path ''`, `timezone UTC`, both role guards, and "false, never NULL" (A:1359-1394). Every existing answer stays the same for `post_policy = 'everyone'`. Its md5 changes: write the new one in the header, as A did (A:72-75).
- `chat_cast_vote(uuid, uuid, uuid, boolean)` keeps its signature, its lock order and its SQLSTATEs (P0C22, P0C24, P0C25, P0C26; B:57-80). Only the one test changes.
- Both INSERT policies on `messages` stay word for word (A:1409-1440). No new permissive INSERT policy on `messages`: it would OR around the Board rule (A's PRE-FLIGHT refused one, A:466-472).
- The standing rule: every public non-trigger function keeps EXECUTE for anon, authenticated and service_role (`20260922090000_guard_function_privileges.sql:48-52`). `CREATE OR REPLACE` keeps the ACL; restate the grant anyway (A:1346-1348).
- Service-only tables: RLS on, no policy, no client grant (B:662-680).
- Migrations are applied to the LOCAL stack only by the batch that owns them (`docker exec … psql`, C:117). Never `supabase db push`. Production waits for Franky's yes.
- Code must run on a database WITHOUT the new column and table (production, until the apply): every new read falls back on `isMissingChatSchema` (`schema.ts:40-58`). The precedent for a select that gains a column: `readChannels(withKind)` (`channels/route.ts:98-117`), `readRow(withRoomColumns)` (`channel-access.ts:71-84`).

**Types and route shapes.**
- `SpaceRoom` (`types.ts:415-422`) and `SpaceResponse`: add fields, never remove or rename. The phone's `ClubSpace` and `RoomChips` read `id, kind, name, unread, can_post, event`.
- `Room` (`types.ts:56-62`): `loadRoom` answering null means "dm / group" or "the read failed" (`rooms.ts:117-128`); a new column in its select must not turn a missing column into "the read failed" (503 on every club room).
- `ThreadMessagesResponse` and `ChatMessage` (`types.ts:278-355`) do not change: `messages.html`, `_miniMessenger.js` and the phone all read them.
- `RefusalCode` + `REFUSAL_SENTENCES` (`types.ts:83-103, 123`): add codes with sentences; never reword an existing sentence. `OFFICER_REMOVED_REASON` is never reworded (`room-rules.ts:26-31`).
- The management routes keep their answers: `room_locked` for core names and core rooms (`channels/route.ts:215-217`, `channels/[channelId]/route.ts:84, 101-104, 226`), the name rule `^[a-z0-9][a-z0-9_-]{1,30}$` (old desktop sends and shows these names), 409 "Channel name already exists".
- `POST /api/me/threads/[id]/pin` (the CHAT pin) keeps its path, body and answer (`pin/route.ts`); `ThreadEntry.pinned_at` and `InboxClub.pinned_at` keep meaning "this chat is pinned for me".
- `DELETE /api/me/threads/[id]/messages/[messageId]`: the sender's own delete stays a hard delete answering `{ ok: true }`; a dm or group still refuses everyone else (`[messageId]/route.ts:98-116`).

**Flag rules.**
- Flag off = today, byte for byte. `ConversationView` is shared by flag-on and flag-off phones and by old Campus (`MessagesMobile.tsx:552, 925`, `CampusMobile.tsx:1089`); `ReactionPicker` and `MessageBubble` are shared too. Every pin affordance arrives through an optional prop that is absent by default.
- The room-management routes are NOT behind `chat_v2` today (old desktop uses them for everyone). Accepting `post_policy` there is safe only because the default is `everyone`; do not gate the routes themselves.
- `GET …/space` is behind `chat_v2` (`space/route.ts:101-103`). The desktop switch is separate: if a person can have desktop on with `chat_v2` off, this gate must accept either (another reader owns the switch; see 6.8).
- `/api/me/features` answers `{ ok: true, chat_v2 }` (`types.ts:178`, `src/app/api/me/features/route.ts`); add keys, never change that one.

**Tests that pin behaviour (each must be updated on purpose, not worked around).**
- `src/lib/chat/reads-routes.test.ts:685` pins the space route's select string `"id, kind, name, event_id, position"`.
- `src/lib/chat/room-rules.test.ts:268-290` pins `REFUSAL_SENTENCES` whole (deepEqual); `:201-205` and on pin `postRefusal`.
- `src/lib/chat/reads.test.ts:151-153` pins `spaceCanPost("board", "admin", null)` and friends (three arguments today).
- `src/components/mobile/messages/club/helpers.test.ts:76-96` pins the chip labels and `aria-label`s.
- `src/lib/chat/members-guard.test.ts` pins the allow-list guard (board / lounge / event refused, officers / room allowed).
- `src/lib/chat/remove-route.test.ts`, `src/lib/chat/cards/routes.test.ts`, `src/lib/chat/cards/rpc-refusal.test.ts`: the remove route and the card routes' SQLSTATE mapping.
- `scripts/sql/chat-v2-rooms-check.sql` (200 cases, local) and `chat-v2-cards-check.sql` exercise `can_post_org_channel` and `chat_cast_vote` by behaviour: both must still pass after the restatement, and the new policy cases belong in a new check script.

---

## 5. Traps

1. **Votes die in a post-restricted room unless `chat_cast_vote` is restated.** It refuses a vote from anyone who cannot post, except on a Board (B:867-868). Easy to miss: the room migration looks complete without it.
2. **`loadRoom` + a new column = 503 on every club room in production.** `loadRoom` treats any select error as "the read failed" for a club room (`rooms.ts:141-145`, the null rule at :117-128), and the code reaches production before the column does. Read `post_policy` with a retry without it, or in a separate tolerant read.
3. **`spaceCanPost` and the thread list say "can post: true" for every extra room** (`reads.ts:178`, `threads/route.ts:817`). If only the database rule changes, chips and old lists show a composer that the send then refuses, and the refusal reads "This chat is closed." (`room-rules.ts:125`).
4. **The Officers room and private rooms have no `channel_members` rows** (A:940). So: no unread dot (`space/route.ts:211-213` answers false without a row), mark-read is a silent no-op (`read/route.ts:19-23`), mute and "pin to top" answer 403 "Not a member" (`pin/route.ts:42-44`), and they never appear in `/api/me/threads` or `/api/me/inbox` (both are built from those rows; the inbox groups only board, lounge and event rows, `reads.ts:110-132`). The desktop slim list and any "unread rooms" count will never include them.
5. **Turning a room private deletes every member's row on it** (A:951-957), with their `last_read_at` and mute; turning it public again re-creates rows as read. Votes cast there go with the rows (`chat_votes_drop_access`, B:932-968; accepted gap, `wave-2-contracts.md:531`). A "Who can see it" toggle in the new dialog needs a plain confirm.
6. **Under `listed`, the allow list means two things.** On a public room the list is "who can post"; flip the room to private and the same people become "who can see". The dialog must say it in one line. A demoted officer added by name keeps access (A:62-64); a person who leaves the club loses the row (`20260928100000`:301-305).
7. **Room names are slugs.** The create and rename routes only take `^[a-z0-9][a-z0-9_-]{1,30}$` (`channels/route.ts:11`, `channels/[channelId]/route.ts:9`), and the chip shows the raw name (`helpers.ts:91`): "rush-chairs", not "Rush chairs". Old desktop prints it as `#name`. Either show it prettified on the new screens or change the rule; do not change the rule quietly (old desktop renames go through the same route).
8. **No cap and no rate limit on creating rooms** (`channels/route.ts:145`). A visible "+" on desktop makes it one click. Franky's accepted plan was "up to 3 custom rooms per club" (`wave-0-decisions.md:18`).
9. **Mods.** A mod can remove messages (`room-rules.ts:24`) but is not an "officer" for posting (`room-rules.ts:21`) or for seeing private rooms (`20260507140000`:1-8), and cannot manage rooms (`officer-guard.ts:35`). "Officers" in the new copy means owner and admin; do not let `OFFICER_ROLES` (which has mods) leak in (`room-rules.ts:13-15`).
10. **Three things are already called pin** (1.7). `/api/me/threads/[id]/pin` pins a chat; a `/pins` route one letter away would be misread and mis-called. The board's "Pinned and unread chats" label is about chats; the panel's "Pinned" is about messages.
11. **A moderator's removal is soft** (`moderation/actions.ts:749-755`): the message row stays, so `ON DELETE CASCADE` does not drop its pin. Without the trigger (3.4) a removed message stays in the Pinned list for its author and as a ghost row for the other person.
12. **"Clear chat history" is per person** (`cleared_at`). A pin on a message one person cleared must not show for that person and must still show for the other. The same for "Shared". Forgetting the filter resurrects cleared photos.
13. **A pending message request** (`accepted_at` null): a reply accepts it implicitly, a pin must not. Refuse the pin until accepted; `ensureMember` already returns `accepted_at` (`channel-access.ts:20-25`).
14. **Block checks in a group are "any pair in the chat"** (A:1433-1439): one blocked pair stops both of them sending to the whole group. The pin route inherits that if it reuses `dmSendBlocked`. That is "as elsewhere in that chat", but expect the question.
15. **Jump-to-message has nothing to stand on.** Neither `messages.html` (`:1520`) nor `MessageBubble` puts the message id in the markup, both load only the newest 50 (`messages.html:2372`, `ConversationView.tsx:165`) and neither pages back. A pin older than 50 messages cannot be scrolled to without new paging code.
16. **Own photos have no hover pill on old desktop** (`messages.html:1361-1371`): add Pin only to `actionsFor` and photos, videos and shared posts (the things most worth pinning) cannot be pinned from a laptop.
17. **`messages.html` polls every 2 s and re-renders the thread.** A Pin button state kept only in the DOM is wiped on the next poll; keep the pinned-id set in the page's state (`__realDM`) and render from it.
18. **Shared videos have no poster.** `media_kind = 'video'` rows carry only the video file behind the proxy; the grid needs `<video preload="metadata">` or a plain tile. Shared posts do have `media_thumbnail_url` (`message-read.ts:124-132`).
19. **`REFUSAL_SENTENCES` is exhaustive by type and by test** (`types.ts:123`, `room-rules.test.ts:268`): a new code without its sentence fails `tsc`; with it, the test's literal must be extended.
20. **`ADD COLUMN` + `ADD CONSTRAINT` on `channels` lock all chat** until commit (A:194-199). The pins file takes no such lock except the brief one `CREATE TRIGGER` needs on `messages`. Keep the two files apart so pins can go to production without a quiet hour.
21. **The local database is not a clean seed** (A:110-122): leftover clubs and rows. Behaviour probes must build their own rows and roll back, as A, B and C do, and must refuse to run against a remote database (`inet_server_addr()` check, `handoffs/chat-redesign/wave-1-build/B1a-review-security.md:65`).

---

## 6. Open questions for the planner (each with a recommended answer)

1. **"Only certain people can type": officers only, or also named people?** Recommended: build `post_policy` with all three values (`everyone`, `officers`, `listed`). `listed` costs one extra arm in one function and one option in the dialog, reuses the allow list that already exists, and is what "certain people" means for a club whose committee chairs are not admins. If time is short, ship `everyone` + `officers` and keep `listed` in the CHECK for later (no second lock on `channels`).
2. **Does the Board become a `post_policy` room?** Recommended: no. The Board keeps its own rule (officers post, members reply under a post). `post_policy` is for extra rooms only, and such rooms have no replies.
3. **A cap on extra rooms?** Recommended: yes, in the create route only, a constant (5), with a new code `room_limit`; rooms over the cap that already exist are kept. Add `rateLimit("room-create:<user>", 10 per 600 s)`. Franky's earlier accepted number was 3 (`wave-0-decisions.md:18`); ask him once: 3 or 5.
4. **Unread on the Officers room and private rooms?** Recommended: not in this build. Keep the accepted gap (14.36), no dot, and write it in the contract so the walk does not report it as a bug. The fix (rows for those viewers, trigger changes) is its own migration after launch.
5. **The megaphone on the phone's Board chip too?** Recommended: yes. `RoomChips` is one component and only `chat_v2` people see it; a desktop-only icon would need a prop for no gain. Update `helpers.test.ts` on purpose. The chip's word stays "Board"; "Announcements" is the desktop panel's section title and the Board room's one-line rule.
6. **Room names: slugs or real names?** Recommended: keep the stored slug and its rule; show it prettified on the new screens (first letter up, `-` and `_` to spaces) through one helper next to `chipLabel`. The dialog takes a normal name and makes the slug. No route or old-screen change.
7. **Who may pin and unpin?** Franky said anyone in the chat. Recommended exactly that, with three refusals: a pending request cannot pin, a blocked pair cannot pin (unpin stays allowed), a restricted (suspended) account cannot pin. Cap 20 per chat.
8. **Which switch gates the pin routes and the panel?** Recommended: the routes answer when EITHER `chat_v2` or the desktop switch is on for the caller (the phone shows Pin only under `chat_v2`, the laptop only under the desktop switch). If the desktop switch can only be on together with `chat_v2`, gate on `chat_v2` alone and say so.
9. **Service-only table or RLS policies for pins?** Recommended: service-only (the `chat_removals` pattern). Three routes are the only readers and writers, the cap and the block rule live in one place, and nothing new is exposed to PostgREST. Realtime is not used anywhere in chat, so nothing is lost.
10. **"Shared": a new route or a mode of the thread GET?** Recommended: a new route, `GET /api/me/threads/[id]/shared`. The thread GET's shape is pinned by tests and read by three old screens.
11. **Jumping to a pin older than the loaded 50.** Recommended: in this build, scroll when loaded, else show "That message is further back in the chat." and write paging for `messages.html` into the after-launch list (it goes away with the React dm thread anyway).
12. **Does the phone get a room-management screen?** Recommended: no, desktop only in this build (point 11 asks for a desktop door). The phone shows the lock, the megaphone and the "who can post" line, which is all a member needs.
13. **Can a non-officer added to the Officers room by name be shown as such?** Recommended: leave the data as is; in the manage dialog list them under "Also in this room" with a remove button (the existing `DELETE …/members/[userId]`), so an owner can clean up a demoted officer (the by-hand step of contract 14.30).
14. **One migration file or two?** Recommended: two (`chat_message_pins`, `chat_room_post_policy`), each with its own rollback. Pins take no long lock and can reach production first.
