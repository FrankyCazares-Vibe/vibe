# Wave 2 as-is: the routes map

Read-only code map of every route and helper wave 2 touches or calls, as of repo HEAD `15a8286` (main = wave 1 live + docs commits), written in a
CLOUD session on 2026-09-30 (no database, no browser; every claim is a `path:line` read with `cat -n` / `sed -n`). Companion of
`handoffs/chat-redesign/wave-1-asis.md` (tables, policies, functions) and `wave-1-build/*.md` (what wave 1 built). Where this file and
`wave-1-contracts.md` sections 4-7 or `src/lib/chat/types.ts` disagree, section 20 lists it.

Reading order: 1-3 (the thread read the card routes reuse) -> 4-6 (helpers and gates) -> 7-9 (the three reads wave 2 adds next to) ->
10-13 (events, channel members, org, hidden sweep) -> 14-18 (shared gates, clients, database facts) -> 19 (Next.js) -> 20-21.

---

## 1. `GET /api/me/threads/[id]/messages` — `src/app/api/me/threads/[id]/messages/route.ts:83-230`

Imports (`:1-42`): from `@/lib/chat/message-read` `MESSAGE_SELECT, MESSAGE_SELECT_BEFORE_ROOMS, VIEWER_OUTSIDE_ROOMS, cleanAfterParam,
clampReadLimit, describeRoom, readChatMessages, roomOf, toChatMessages, viewerInRoom, type MessageRow` (`:3-15`); `postRefusal`
(`:16`); `canPostAnswer, clubRole, filterRoomReaders` (`:17`); `isMissingChatSchema, warnMissingChatSchemaOnce` (`:18`); `refusalBody` +
types (`:19-26`); mentions (`:27-31`); `ensureMember, isChannelMessageMediaKey` (`:32`); push (`:33`); `contentBlockedResponse,
requireCanPublish` (`:34`); `checkText` (`:35`); `rateLimit, tooManyRequests` (`:36`); `dmSendBlocked` (`:37`); the two Supabase clients
(`:38-42`). `RouteCtx = { params: Promise<{ id: string }> }` (`:56`). `refuse(code, status)` = `NextResponse.json(refusalBody(code), { status })`
(`:59-61`). `POST_REFUSAL_STATUS`: board_officers_only 403, board_post_missing 409, thread_root_not_allowed 400, room_closed 403 (`:64-69`).

Gate order, GET:
1. `await ctx.params` (`:84`), cookie client (`:85`), `auth.getUser()`; no user -> 401 `{ ok: false, error: "Unauthorized" }` (`:86-92`). NO rate
   limit, NO `chatV2For`, NO Terms/restriction gate on GET.
2. `ensureMember(supabase, channelId, user.id)` (`:94`); `!member.ok` -> `{ ok: false, error: "Not a member" }` with `member.status` (403 or 500)
   (`:95-97`).
3. Query params (`:99-118`): `before` = raw string or undefined (blank = absent, `:101`); `afterRaw` trimmed (`:102`); `root` trimmed or undefined
   (`:103`); `limit` = `clampReadLimit(Number(limit) | undefined, root !== undefined)` (`:106-107`). **`?after=`**: when non-blank,
   `cleanAfterParam(afterRaw)`; null -> `400 { ok: false, error: "Invalid after" }` with NO `code` (`:112-118`). This is the answer D4's
   `invalid_after` replaces. (`readChatMessages` repeats the same check inside, `message-read.ts:709-713`, answering `failed(400, "Invalid after")`.)
4. `roomOf(channelId, member)` (`:122`); `found.failed` -> 503 `try_again` (`:123`). `found.room` is null for a dm/group and for a club channel
   whose `ensureMember.kind` is null (schema missing).
5. In parallel (`:130-138`): `readChatMessages(supabase, channelId, { before, after, root, limit }, { viewerId, access: member, room: found.room })`
   and, when `found.room`, `describeRoom(supabase, found.room, user.id)` (else `null`). `!read.ok` -> `read.body` with `read.status` (`:139`).
6. Club channel (`member.isOrgChannel`, `:145-164`): `room = null`, `viewer = VIEWER_OUTSIDE_ROOMS` by default; when `found.room`:
   `viewerInRoom(found.room, read.viewerRole, described.mayPost)`; `!described || !inRoom` -> 503 `try_again` (`:149-150`). Body
   (`ThreadMessagesResponse`): `{ ok: true, messages, viewer_id, peer_last_read_at: null, peer_typing: [], room, viewer }` (`:154-163`).
7. Dm/group (`:166-229`): `channel_members` read with `typing_until` and a column-missing fallback (`:176-199`); `peer_last_read_at` = max
   `last_read_at` of the others (`:201-205`); `peer_typing` = others whose `typing_until` is in the future (`:207-215`); body with `room: null`,
   `viewer: VIEWER_OUTSIDE_ROOMS` (`:220-229`).

How `room` and `viewer` are computed: `room` = `describeRoom().room` (`ThreadRoom`: org via `readOrgRef` on the cookie client, event via
`readRoomEvent` with the service role, `message-read.ts:1026-1041`); `viewer.role` = `read.viewerRole` (the same `org_members` read as the
authors' roles, `message-read.ts:788`); `viewer.can_post` = `describeRoom().mayPost` = `canPostAnswer(client, room.id, viewerId, null) === "yes"`
(`message-read.ts:1033,1039`); `can_reply` = `room.kind === "board"`; `can_moderate` = `canModerate(role)` (`message-read.ts:1051-1059`).
The route therefore re-reads org + event counts + `can_post_org_channel` on EVERY poll (S69 carry-over: the new screens read them on the
every-5th re-read only).

Missing-schema paths on GET: `ensureMember` retries `channels` with `org_id` alone (`channel-access.ts:77-83`) so `kind` is null; `roomOf`
answers `{ room: null, failed: false }` (`message-read.ts:647`); the read retries `MESSAGE_SELECT_BEFORE_ROOMS` then `MESSAGE_SELECT_BARE`
(`message-read.ts:751-764`), `?root=` on such a database answers 404 `board_post_missing` (`:754`); the club body is sent with `room: null` and
`VIEWER_OUTSIDE_ROOMS` (`route.ts:146-147`).

## 2. `POST /api/me/threads/[id]/messages` — `route.ts:237-609`

`SendBody` (`:46-54`): `content, attachment_id, attachment_kind ('post'|'clip'), media_url (R2 key), media_kind ('image'|'video'),
parent_message_id, thread_root_id`. `MAX_CONTENT = 4000` (`:44`). `kind` is never read from the body (`:447-449`).

Gate order, POST:
1. params, cookie client, auth -> 401 (`:238-246`).
2. `rateLimit("message-send:<uid>", { limit: 60, windowSec: 60 })` -> `tooManyRequests(rl)` (`:248-249`). Cards share this bucket (contract 4.4).
3. `requireCanPublish(user.id)` (Terms, restriction, verified school email) (`:254-255`).
4. JSON -> 400 `"Invalid JSON"` (`:257-262`). Field cleaning (`:264-280`). Empty (no content, attachment, media) -> 400 `"Empty message"`
   (`:282-284`); too long -> 400 `"Message too long"` (`:285-287`); `checkText(content)` not ok -> `contentBlockedResponse("content")` (422)
   (`:288`).
5. Media validation (`:292-310`): bad key or bad kind -> a SECOND `ensureMember` call; a club channel answers 400 `club_media_off`, else 400
   `"Invalid media key"` / `"Invalid media_kind"`.
6. Attachment check on the cookie client (`posts` select; 400 / 404 / mismatch) (`:315-342`).
7. `ensureMember` (`:344-347`) -> `"Not a member"` with its status.
8. Club room + any `media_url` -> 400 `club_media_off` (`:355`).
9. `thread_root_id` cleaned ONCE (`:360-364`): present but not a string -> 400 `thread_root_not_allowed`; trimmed; blank -> null.
10. dm/group with a root -> `postRefusal(null, rootId, null)` = `thread_root_not_allowed` 400 (`:368-371`).
11. `roomOf` (`:375-377`); failed -> 503 `try_again`. Club room: `canPostAnswer(supabase, channelId, user.id, rootId)` (`:379`): `"failed"` -> 503
    `try_again`; `"no"` -> `clubRole(member.orgId, user.id)` then `postRefusal(room, rootId, role)` with `POST_REFUSAL_STATUS` (`:382-386`).
12. `inBoard = room?.kind === "board"` (`:388`); `parent_message_id` ignored in a Board, else verified same channel (`:395-413`).
13. dm/group only: `dmSendBlocked(supabase, channelId, user.id)`; `!ok` -> 500 `{ code: "block_check_failed" }`; blocked -> 403 `"Couldn't send
    this message"` (`:420-435`). NOT asked in club rooms (`:415-417`, the comment states why).
14. Insert on the cookie client with `MESSAGE_SELECT` (`:437-457`); `thread_root_id` only written for a reply (`:450`). Missing chat schema ->
    a reply answers 503 `try_again`, else re-insert with `MESSAGE_SELECT_BEFORE_ROOMS` (`:461-469`); the older attachment/media fallback re-inserts
    the bare row, never for a reply (`:474-486`). Insert error `42501` on a club room: `canPostAnswer` asked again; `"no"` -> the refusal code,
    else a logged CONTRACT BUG and 500 (`:489-511`).
15. After the insert: push enqueue for dm/group only (`:519-522`); implicit accept + `last_read_at` bump for dm/group only (`:526-543`);
    @mentions: club room targets through `filterRoomReaders(channelId, ids)`, dm/group through `channel_members` (`:553-595`);
    `insertMentionNotifications` with the service role and `kickPushDrain()` for a club room (`:578-587`).
16. Answer: `toChatMessages(supabase, [inserted], { channelId, viewerId, room, skipReplyCounts: true, skipReactions: true })` -> `{ ok: true,
    message }` (`:601-608`). Status 200 (not 201).

## 3. `src/lib/chat/message-read.ts` (1,078 lines) — every export

Constants and row types:
- `MESSAGE_COLUMNS` (`:62-63`), `MESSAGE_JOINS` (`:65-67`: `users` and `attachment:posts` joins).
- `export const MESSAGE_SELECT` = columns + `kind, thread_root_id, card_event_id, removed_at, removed_reason` + joins (`:74-75`).
- `export const MESSAGE_SELECT_BEFORE_ROOMS` (`:78`), `export const MESSAGE_SELECT_BARE` (`:81-82`), `BARE_RETRY` regex (`:85`).
- `export type MessageRow` (`:87-110`): `id, content, created_at, user_id, media_url?, media_kind?, attachment_id?, attachment_kind?,
  parent_message_id?, users?: unknown, attachment?: AttachmentRow | null, kind?: unknown, thread_root_id?, card_event_id?, removed_at?,
  removed_reason?, channel_id? (only readChatMessage selects it), parent_preview?, reactions?`.
- `export type AttachmentRow` (`:114-122`), `export type ParentPreview` (`:124-131`).
- `export async function hydrateReactions(supabase, rows, viewerId): Promise<void>` (`:138-164`), `hydrateParentPreviews(supabase, rows):
  Promise<void>` (`:175-214`), `export function prepareForClient(rows, channelId): void` (`:226-247`).
- Internal caps: `IDS_PER_READ = 100` (`:255`), `ROWS_PER_PAGE = 1000` (`:258`), `REPLY_PAGES_MAX = 5` (`:261`), `GOING_SHOWN = 8` (`:264`),
  `RSVPS_READ_MAX = 500` (`:267`). `serviceOrNull(tag)` (`:276-287`).
- `export function cleanAfterParam(raw: string): string | null` (`:326-332`): trims, repairs a "+" that arrived as a space (`PLUS_LOST`, `:297`),
  matches `SENT_TIMESTAMP` (`:293-294`) and `namesARealMoment` (`:300-317`); the string is never re-formatted.
- `export const READ_LIMIT_MAX = 200`, `READ_LIMIT_DEFAULT = 50` (`:335-336`); `export function clampReadLimit(raw: unknown, root: boolean):
  number` (`:342-346`): 1..200, fallback 200 with a root else 50.
- `readRoles(orgId, userIds): Promise<Map<string, ClubRole> | null>` (service role, `org_members`, chunks of 100; null on any failure)
  (`:354-374`). `readReplyCounts(channelId, postIds, viewerId): Promise<Map<string, number> | null>` (service role; walks `messages` by
  `thread_root_id in (...)` with `removed_at is null OR user_id = viewer`, up to 5 pages of 1000; null on failure or overflow) (`:390-438`).
  This walk is what D3's grouped count function replaces (`:388`).
- `export type MessageContext = { channelId; viewerId; room: Room | null; skipReplyCounts?; skipReactions?; alsoRoleOf? }` (`:441-458`).
- `export async function toChatMessages(client, rows, ctx): Promise<ChatMessage[]>` (`:522-528`) = `buildChatMessages(...).messages`.
- `buildChatMessages(client, rows, ctx): Promise<{ messages, complete, roles }>` (`:531-583`): drops someone else's removed rows (`:533`);
  reads roles + reply counts + reactions + parent previews in parallel (`:541-546`); `prepareForClient` (`:548`); maps each row to `ChatMessage`
  (`:550-581`). **`card: null` is set at `:574` ("Cards are wave 2"); `hidden: false` at `:578`.** `kind` via `messageKind()` (`:473-475`),
  `users` via `toPerson()` (`:478-490`, null handle/name -> ""), `removed` via `removedInfo()` (`:497-505`, viewer's own only, `by` from
  `OFFICER_REMOVED_REASON`). **Where `hydrateCards` plugs in:** alongside the `Promise.all` at `:541-546` (rows are already viewer-scoped, so the
  service-role read of the side tables is safe), and `card: hydrated.get(row.id) ?? null` at `:574`. Note `card_event_id` is on the row (`:102`)
  but nothing reads it yet.
- `export type ReadOptions = { before?; after?; root?; limit: number }` (`:586`); `export type ReadKnown = { viewerId?; access?; room? }`
  (`:593-604`); `export type ReadFailure = { ok: false; status; body: Refusal | { ok: false; error } }` (`:606-610`);
  `export type ReadMessagesResult = { ok: true; messages: ChatMessage[]; room: Room | null; viewerRole: ClubRole | null } | ReadFailure`
  (`:612-626`).
- `export async function roomOf(channelId, access: Extract<ChannelAccess, { ok: true }>): Promise<{ room: Room | null; failed: boolean }>`
  (`:643-650`): `!isOrgChannel || !kind` -> `{ null, false }`; else `loadRoom`, `failed = room === null`.
- `rootState(client, channelId, room, root): "yes" | "no" | "failed"` (`:659-681`): cookie-client read of the root; must be same room, top-level,
  not removed.
- `export async function readChatMessages(client, channelId, opts, known?): Promise<ReadMessagesResult>` (`:700-790`): clamp + `after` check
  (`:706-713`, 400 "Invalid after"), `viewerOf` (401), `ensureMember` unless `known.access` (403/500 "Not a member"), `roomOf` unless
  `known.room !== undefined` (503), `rootState` (503 / 404 `board_post_missing`), `cleared_at` for dm/group (`:736`), the query (`:738-746`:
  `thread_root_id is null` in a club room without root, `lt created_at before`, `gte created_at after`, order asc when after/root without
  before), the three-step select fallback (`:750-764`), 500 "Request failed" (`:765-768`), `buildChatMessages` with `alsoRoleOf: viewerId`
  (`:772-778`), `!complete` -> 503 `try_again` (`:781`), reverse to oldest-first (`:783`), `viewerRole` from the roles map (`:788`).
- `export async function readChatMessage(client, id, known?): Promise<ChatMessage | null>` (`:797-832`): `isUuid` check; selects
  `channel_id, MESSAGE_SELECT`; `loadRoom(row.channel_id)` when rooms exist; a club channel whose room cannot be read answers null (`:824-827`);
  `buildChatMessages` with `skipReplyCounts` unset (so a Board post gets its count); null when roles failed.
- `export const VIEWER_OUTSIDE_ROOMS: ViewerInRoom = { role: null, can_post: true, can_reply: false, can_moderate: false }` (frozen, `:835-840`).
- `readOrgRef(client, orgId): Promise<OrgRef | null>` (cookie client, `orgs` `id, handle, name, logo_url, banner_url, verified`; proxy URLs via
  `orgAssetProxyUrl`; `verified === true`) (`:843-870`).
- `readGoing(client, service, room, goingIds): Promise<Person[] | null>` (`:881-922`): room members only (`channel_members` on the service
  role), people on the cookie client, first 8.
- `readRoomEvent(client, room, viewerId): Promise<ThreadRoom["event"] | "failed">` (`:925-1001`): `events.location` + all going/maybe `rsvps`
  (service role, 500 cap, exact count, counts asked apart past the cap), `state: roomState(...)`, `room_id: room.id`, `viewer_status`.
- `export type RoomDescription = { room: ThreadRoom; mayPost: boolean }` (`:1004-1008`); `export async function describeRoom(client, room,
  viewerId): Promise<RoomDescription | null>` (`:1026-1041`).
- `export function viewerInRoom(room, role, mayPost): ViewerInRoom | null` (`:1051-1059`; null role -> null).
- `export async function readThreadRoom(client, room, viewerId): Promise<{ room: ThreadRoom; viewer: ViewerInRoom } | null>` (`:1066-1078`):
  `describeRoom` + `clubRole` in parallel; for callers without a page.

## 4. The room helpers

### 4.1 `src/lib/chat/rooms.ts` (349 lines; `server-only`, `:28`)
- `isId(value)` = the loose uuid shape (any version) (`:50-55`); `logFailureOnce(tag, what)` caps at 40 causes per instance (`:64-80`);
  `serviceClient(tag)` (`:91-102`).
- `export async function loadRoom(channelId: string): Promise<Room | null>` (`:130-183`): service role; `channels` select `id, kind, name, org_id,
  event_id`; null for a dm/group, an unknown id, a row without a room kind, or a read that failed (logged once); an `event` room ALWAYS carries
  its event (`events` select `id, title, starts_at, ends_at`; a missing event = null room) (`:157-178`). Never throws.
- `export type CanPostAnswer = "yes" | "no" | "failed"` (`:189`). `export async function canPostAnswer(client, channelId, userId, rootId: string |
  null): Promise<CanPostAnswer>` (`:219-252`): rpc `can_post_org_channel({ cid, uid, root })` on the given client; root present but not a string
  -> "no"; non-uuid ids -> "no"; missing schema -> "yes"; any other error or throw -> "failed".
- `export async function canPost(client, channelId, userId, rootId): Promise<boolean>` = `=== "yes"` (`:260-267`).
- `export async function filterRoomReaders(channelId, userIds): Promise<string[]>` (`:281-320`): service role; rpc `can_view_org_channel` ONCE
  PER PERSON, 20 at a time (`:58`, `:297-318`); order kept, deduped case-insensitively.
- `export async function clubRole(orgId, userId): Promise<ClubRole | null>` (`:327-349`): service role `org_members.role` maybeSingle.

### 4.2 `src/lib/chat/room-rules.ts` (126 lines; pure)
- `BOARD_POSTER_ROLES = ["owner","admin"]` (`:21`), `ROOM_MODERATOR_ROLES = ["owner","admin","mod"]` (`:24`),
  `OFFICER_REMOVED_REASON = "Removed by a club officer."` (`:31`), `isRoomKind` (`:37-39`), `isClubRole` (`:42-44`), `canModerate(role)`
  (`:47-49`), `rank()` owner 3 / admin 2 / mod 1 / else 0 (`:52-57`), `outranks(callerRole, authorRole)`: caller >= 1 and caller >= author
  (`:67-71`), `clubRoomLabel(clubName, kind, roomName)` " · " separator (`:73-93`), `postRefusal(room, rootId, role): PostRefusalCode`
  (`:112-126`; table at `:100-106`).

### 4.3 `src/lib/chat/flag.ts` (98 lines; pure) and `flag-server.ts` (108 lines; `server-only`)
- `chatV2MayRunHere(env)` = `VERCEL_ENV === "production" || NODE_ENV === "development"` (`flag.ts:46-48`); `chatV2Enabled(env)` = exactly
  `"true"` and may run here (`:54-56`); `chatV2Everyone` (`*` as the whole value, `:63-66`); `chatV2ListedUser(userId, env)` (`:73-81`);
  `chatV2ClubIds(env)` (`:90-98`).
- `export async function chatV2For(userId: string): Promise<boolean>` (`flag-server.ts:75-108`): switch off -> false; everyone -> true; listed
  -> true; else one service-role `org_members` read `org_id in (clubIds)` limit 1 (`:93-98`); any failure -> false (logged once, `:36-40`).
  No caching (`:14-16`).

### 4.4 `src/lib/chat/schema.ts` (72 lines; no imports)
- `MISSING_SCHEMA_CODES = 42P01, 42703, PGRST204, PGRST205, PGRST202, 42883` (`:23`). `isMissingChatSchema(error)` (`:40-58`): an error with a
  code is judged by the code alone; message read only when there is no code. `warnMissingChatSchemaOnce(tag)` (`:66-72`).

### 4.5 `src/lib/chat/room-state.ts` (118 lines; pure)
- `ROOM_OPEN_AFTER_END_MS = 7 days` (`:30`); `roomState(starts_at, ends_at, now = new Date()): RoomState` (`:108-118`): closed on any unparseable
  or zone-less date; soon / live (both ends inclusive) / after / closed.

## 5. `src/lib/messages/channel-access.ts` (185 lines) — `ensureMember`

`export type ChannelAccess` (`:18-37`):
```ts
| { ok: true; isOrgChannel: false; orgId: null; accepted_at: string | null; cleared_at: string | null }
| { ok: true; isOrgChannel: true; orgId: string; accepted_at: null; cleared_at: null; kind?: RoomKind | null; eventId?: string | null }
| { ok: false; status: number }
```
`export async function ensureMember(supabase, channelId, userId): Promise<ChannelAccess>` (`:52-158`): non-uuid (`isUuid`, strict) -> `{ ok:
false, status: 403 }` (`:59`); `channels` read on the CALLER's client `org_id, kind, event_id` with a bare retry on missing schema (`:70-83`);
read error -> 500 (`:84-87`); no row (RLS hides it) -> 403 (`:99`); `org_id` set -> rpc `can_view_org_channel({ cid, uid })`; rpc error -> 500;
`!== true` -> 403; ok with `kind` (`isRoomKind` else null) and `eventId` (`:101-121`); else the `channel_members` row (`accepted_at, cleared_at`
with a column fallback) -> 403 when none (`:128-157`). Also exports `isChannelMessageMediaKey(key, channelId)` (`:168-176`) and
`messageMediaProxyUrl(channelId, messageId)` (`:183-185`).

## 6. `DELETE /api/me/threads/[id]/messages/[messageId]` — `src/app/api/me/threads/[id]/messages/[messageId]/route.ts:16-60` (all of it)

Imports only `NextResponse` and `createSupabaseServerClient` (`:1-3`). `RouteCtx = { params: Promise<{ id; messageId }> }` (`:5`).
1. params (`:17`), cookie client, auth -> 401 `"Unauthorized"` (`:18-25`). No rate limit, no restriction gate.
2. Lookup on the cookie client: `messages` select `id, user_id, channel_id` where `id = messageId AND channel_id = channelId` maybeSingle
   (`:30-35`); error -> 500 `"Request failed"` (`:36-39`); no row -> 404 `"Message not found"` (`:40-42`); `user_id !== user.id` -> 403 `"Only the
   sender can delete this message"` (`:43-48`).
3. `messages.delete().eq("id", messageId).eq("user_id", user.id)` on the cookie client (`:50-54`); error -> 500; else `{ ok: true }` (`:59`).
Hard delete only; policy `messages_delete_own USING (auth.uid() = user_id)` (asis 2.2) — migration A did not alter it (its `alter policy` list
is `messages_insert_org_member`, `messages_insert_member`, `channel_members_delete_own_pending`; `20261001100000_chat_v2_rooms.sql:1409,1422,1444`).
No `code` in any answer. Sibling folders: `media/`, `react/` (`ls`).

## 7. `GET /api/me/threads` — `src/app/api/me/threads/route.ts:416-877` (POST `:219-400` creates dms/groups; untouched by wave 2)

`ThreadEntry` (`:61-89`): `id, type ('dm'|'group'|'org_channel'|'org_subchannel'), name, photo_url, peer: ThreadPeer | null, members:
ThreadMember[], last_message: { content, created_at, user_id, media_kind, attachment_kind } | null, unread, accepted_at, is_request,
peer_last_read_at, pinned_at, viewer_role ('admin'|'member' = the channel_members row role, NOT the club role), muted_until` `&
Partial<ThreadEntryRoomFields>` (= `org: OrgRef, room_kind: RoomKind, can_post: boolean`, `types.ts:322`).

Flow: auth 401 (`:417-424`); `chatsOnly = ?scope=chats` (`:426`); `channel_members` read with `channels!inner(id, type, name, org_id, kind)`
and a no-`kind` retry (`roomsReady`, `:436-451`); rows filtered: `chatsOnly ? !isClubRoom : kind !== "event"` (`:481-486`); empty ->
`{ ok: true, threads: [], requests: [] }` (`:487-489`). `isClubRoom` = `org_id` set or type org_channel/org_subchannel (`:477-480`).
Club rooms: ONE `orgs` read (`id, handle, name, logo_url, banner_url, verified`) and ONE `org_members` read (`org_id, role`) for the viewer,
both on the cookie client, FAIL CLOSED with 500 (`:507-541`); `OrgRef` built with `orgAssetProxyUrl` (`:529-536`). `photo_url` and
`hidden_at, pinned_at, muted_until` read separately, soft-fail (`:545-582`). Co-members read (`:586-597`). Last messages: two reads (dms/groups
| club rooms), 5 rows per channel, `thread_root_id is null` when `roomsReady` (`:661-693`). `loadHiddenUsers` fails closed 500 (`:716-721`);
1:1 dm with a blocked peer skipped (`:732-738`). Requests: `accepted_at === null && !clubRoom`, and only with an inbound message (`:749-754`).
`hidden_at` soft-hide unless a newer message (`:758-762`). **`unread` = last message by someone else AND (`last_read_at` null OR
`last.created_at > last_read_at`)** (`:764-767`). Club-room `name` = `clubRoomLabel(org.name, roomKind, channels.name)`; `can_post` = board ->
role in `BOARD_POSTER_ROLES` else true (`:789-803`). Sort: pinned first (newest pin first), then last message recency; dms deduped by peer id
(`:830-850`). Group photos signed (`:858-870`). Answer `{ ok: true, threads, requests }` (`:872-876`).
`last_read_at` is written by `POST /api/me/threads/[id]/read` (`src/app/api/me/threads/[id]/read/route.ts:19-23`, cookie client, no
membership check beyond RLS) and by the send route (`messages/route.ts:538-542`, dm/group only).

## 8. `GET /api/me/calendar` — `src/app/api/me/calendar/route.ts:56-138`

`CalendarEntry` (`:27-48`): `{ kind: "rsvp", id (= event id), title, starts_at, ends_at, location, color ("#5BD18C" going / "#FFB85A" maybe),
viewer_status: "going"|"maybe", org: { handle, name, verified } | null }` or `{ kind: "personal", id, title, starts_at, ends_at | null,
location, notes, color }`. Auth 401 (`:57-64`); `?from` / `?to` default -30 / +180 days (`:66-72`). The rsvp query on the COOKIE client
(`:75-86`): `rsvps` select `status, event:events!inner(id,title,starts_at,ends_at,location, org:orgs(handle,name,verified))` where `user_id =
me`, `status in (going, maybe)`, `event.starts_at` between from and to. Errors are logged and swallowed (`:95-100`); rows without an event are
skipped (`:105`). Sorted by `starts_at` (`:133-135`); answer `{ ok: true, entries }` (`:137`). Not gated by the flag. **The `org` embed comes
through the viewer's RLS (`orgs_select`), so `org` is null for a private club the viewer left; `org_id` is not selected** — the three
`CalendarRoomFields` (`types.ts:362-366`: `org_id, room_id, room_state`) need `event.org_id` added to the select and a room lookup.

## 9. `POST /api/me/reports` — `src/app/api/me/reports/route.ts:461-575` and the report lookups

The message spec (`:318-333`): `message: { table: "messages", columns: "id,user_id,channel_id,content,media_url,created_at", owner: "user_id" }`
(`:321-325`). The pipeline `readTarget()` (`:285-344`): a post goes through `postAccessForCaller` + `crossBlockFallback` (`:303-316`); every
other type is ONE read on the REPORTER's client (`one()`, `:291-301`); no row -> `not_found` (a comment falls back to `crossBlockFallback`)
(`:337-341`); a `user` snapshot adds `bio` with the service role (`:342`); returns `{ ownerId, snapshot }` (`:343`). `withOwnerHandle()`
(`:352-368`) adds `owner_handle, owner_name` on the cookie client. POST order (`:461-575`): auth; JSON; `target_type` (`isReportTargetType`,
list `post, comment, message, user, channel, org, event`, `src/lib/moderation/reports.ts:29-37`), `isUuid(target_id)`, `reason_code`, self
(`:478-490`); `rateLimit("report:<uid>", 10 / 3600)` (`:494-495`); `requireNotRestricted` (`:499-500`); `readTarget` -> 500 / 404 `"That's not
there anymore"` (`:502-507`); own thing -> 400 (`:508-510`); service client; `alreadyOpen()` -> silent `{ ok: true }` (`:512-513`); insert
with `target_owner_id, target_snapshot` + a column-missing fallback (`:527-538`); `23505` -> ok, `23514` -> 400 (`:539-551`);
`alertAdminsOfReport` with `openReportCount` (`:559-572`).

**"An OPEN report on this message":** `alreadyOpen(service, reporterId, targetType, targetId)` (`:385-408`) = `reports` select `id` where
`reporter_id, target_type, target_id, status = 'open'` limit 1; `openReportCount(service, targetType, targetId)` (`:419-440`) = the same
without the reporter, `count: "exact", head: true`; both fall back when `status` is missing (`isMissingColumnError`, `NEW_REPORT_COLUMNS =
status, target_owner_id, target_snapshot`, `:64`). The remove route's check is `openReportCount`'s query shape with `target_type = 'message'`.

`reports` columns: base (`supabase/migrations/20260506100000_safety_block_mute_report.sql:79-89`) `id, reporter_id (SET NULL), target_type,
target_id uuid NOT NULL, reason_code, reason (<= 1000), created_at`; index `idx_reports_target (target_type, target_id)` (`:92`).
Moderation foundation (`20260923090000_moderation_foundation.sql:2054-2067`) adds `status text NOT NULL DEFAULT 'open'`, `resolved_by`,
`resolved_at`, `resolution_note`, `target_owner_id`, `target_snapshot jsonb`, `admin_alerted_at`; `reports_status_check IN ('open',
'actioned', 'dismissed')` (`:2069-2071`); `reports_target_type_check IN ('user','post','comment','message','channel','org','event')`
(`:2076-2079`); partial unique index `reports_one_open_per_reporter_target (reporter_id, target_type, target_id)` where open (`:2105-2107`).
`REPORT_STATUSES = ["open","actioned","dismissed"]` (`src/lib/moderation/reports.ts:69`).

## 10. Where `moderation_actions` rows are written — `src/app/api/admin/content/remove/route.ts`

`POST /api/admin/content/remove` (`:91-223`): `requirePlatformAdmin()` (`:92-93`); body `{ type: post|comment|message, id, reason, reportIds? }`
(`:102-113`); admin rate limit (`:115-116`); service-role read `id, user_id, removed_at` (`:123-132`); soft removal `update({ removed_at,
removed_by: gate.userId, removed_reason: reason }).is("removed_at", null)` (`:142-158`); `closeReports()` sets `status: 'actioned',
resolved_by, resolved_at, resolution_note` on open reports of this target (`:281-311`); **`logModerationAction(service, { actorId, action:
"<type>_remove", targetType, targetId, reportId, reason, meta })`** (`:170-193`) is the ONLY writer of `moderation_actions` on a message
removal — `src/lib/auth/require-platform-admin.ts:183-210` inserts `actor_id, action, target_type, target_id, report_id, reason, meta`.
Table (`20260923090000_moderation_foundation.sql:1894-1925`): `action` CHECK includes `message_remove`; service role only, append-only trigger
(`:1928-1958`). The officer remove route (contract 6.3, D9) writes `removed_at / removed_by / removed_reason` on `messages` and NOTHING here.
`messages.removed_at, removed_by (users SET NULL), removed_reason (<= 2000)` were added at `:2145-2147`.

## 11. Events

### 11.1 `PUT` / `DELETE /api/events/[id]/rsvp` — `src/app/api/events/[id]/rsvp/route.ts`
`fail(status, code, error)` = `{ ok: false, error, code }` (`:13-15`). Body `{ status?: unknown }` (`:11`).
- `PUT` (`:130-180`): `isUuid(id)` else 400 `invalid_event_id`; auth 401 `unauthorized`; `rateLimit("rsvp:<uid>", 60 / 600)`;
  `requireTermsAccepted` (NOT `requireNotRestricted`; `:150-151`); JSON 400 `invalid_json`; `status` must be `going` or `maybe` (400
  `invalid_status`, `:160-163`); `rsvpBlocked()` (`:38-116`, service role: event missing 404 `not_found`; org `hidden_at` 404; campus rule 403
  `campus_visiting` unless a member of the club); then `rsvps.upsert({ event_id, user_id, status }, { onConflict: "event_id,user_id" })` ON
  THE COOKIE CLIENT (`:168-173`); 500 `request_failed`; answer `{ ok: true }` (`:179`) — no counts, no card.
- `DELETE` (`:197-226`): uuid 400; auth; the same rate limit; `rsvps.delete().eq(event_id).eq(user_id)`; `{ ok: true }`. No hidden/campus/Terms
  gate on purpose (`:186-195`).
- `rsvps` has a trigger since migration A (`chat_rsvps_room`, contract 15.1) that adds/removes the event-room `channel_members` row; the route
  itself knows nothing about rooms.

### 11.2 `POST /api/events` — `src/app/api/events/route.ts:389-528`
Gates: auth (`:390-397`); `rateLimit("event-create:<uid>", 10 / 3600)` (`:401-402`); `requireCanPublish` (`:429-430`); JSON object (`:432-443`);
`checkEventFields(readEventFields(body), Date.now())` (title 1..120, description <= 2000, location <= 200, the word filter with `field`,
start/end rules, <= 14 days; `src/lib/events/validate.ts`) (`:457-464`); `org_id` required and a uuid (400 `org_required`, `:469-472`);
service-role `orgs` `id, verified, hidden_at` + `org_members.role` (`:476-485`); missing or hidden -> 404 `not_found`; unverified -> 403
`org_unverified`; not owner/admin -> 403 `org_role_required` (`:494-503`). Insert with the SERVICE role: `creator_id, org_id, title,
description, location, starts_at, ends_at` (`:508-520`); answer `{ ok: true, event: row }` with `EVENT_ROW_COLUMNS` =
`id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at` (`src/lib/events/event-item.ts:17-18`). What an event has
(asis 1.7): exactly those columns; no cover, no status/cancelled, no visibility. Migration A's `chat_events_room` trigger (function `20261001100000_chat_v2_rooms.sql:1140`, insert `:1152`, trigger `:1183`) creates the event
room on insert.
`GET /api/events` (`:105-380`) answers list items via `toEventListItem` (`event-item.ts:59-91`) with `going_count`/`interested_count` from rpc
`event_rsvp_counts` (`:342`) and `viewer_status`; `?org_id=` skips the campus filter (`:208-222`).

### 11.3 `src/app/api/events/[id]/route.ts` — DELETE and PATCH only (NO GET)
`fail()` here also carries `message` (`:50-52`). `loadForOfficer(id, userId, tag)` (`:72-121`): service role; event missing or org-less -> 404
`not_found` "That event is no longer available."; org hidden -> officers 403 `org_hidden`, others 404; not owner/admin -> 403
`org_role_required`. `DELETE` (`:144-202`): rate limit 30 / 600, `loadForOfficer`, `requireNotRestricted`, cancel notices to going/maybe when
not ended, delete on the COOKIE client (`events_delete_manager`), `{ ok: true, notified }`. `PATCH` (`:272-338`): rate limit, `requireCanPublish`,
`loadForOfficer`, verified, not ended (409 `event_ended`), `org_id` unchanged (400 `org_cannot_change`), validate, service-role update,
`{ ok: true, event: <list item> }`. **There is no single-event read route; an Event card must get its event from `loadRoom` (`rooms.ts:160-177`),
the thread `room.event`, `GET /api/events?org_id=`, or a new read.** Other files in the folder: `attendees/`, `ics/`, `rsvp/` (`ls`).

### 11.4 `GET /api/events/[id]/attendees` — `src/app/api/events/[id]/attendees/route.ts:32-96`
uuid 400; auth 401; `events` select `id` on the cookie client -> 404 `"Event not found"` (`:48-59`); rpc `can_manage_event({ p_event_id })`
must be `true` else 403 `"Forbidden"` (`:61-70`); `rsvps` select `status, created_at, user:users!rsvps_user_id_fkey!inner(id,name,handle,
avatar_url,major,year)` ordered by `created_at` (`:72-79`); answer `{ ok: true, going: RsvpRow[], interested: RsvpRow[] }` (`:86-95`). **Only a
CURRENT owner/admin of the club (or an org-less event's creator) may see names** (`:21-30`); a plain member cannot. The thread read's "first 8
going" therefore reads `rsvps` with the service role and the people on the cookie client (`message-read.ts:881-922`).

## 12. Channel members routes and the kinds rule today

### 12.1 `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts` (190 lines)
`requireChannelStaff(slug, channelId, viewerId, checkRestriction)` (`:17-39`): optional `requireNotRestricted`; `loadClubOfficer(slug,
viewerId, { channelId })` (`src/lib/club-routes/officer-guard.ts:75-150`: service role, `orgs` by handle, `org_members.role`, `officerGate`
with `CHANNEL_ADMIN_ROLES = owner, admin` (`:35`), 404 "Not found" for a stranger to a hidden club, 403 "Admin only", the channel must belong to
the club, `kind` read with a bare retry (`:122-135`)); no channel -> 404 `"Channel not found"`.
- `GET` (`:47-92`): staff only; `org_channel_members` with `users` join -> `{ ok: true, members: [{ user_id, added_at, name, handle, avatar_url,
  school_verified }] }`.
- `POST` (`:105-190`): staff + restriction; body `{ user_id } | { handle }` (`:127-149`); target must be a club member (400 `"User must join the
  org first"`, `:152-163`); idempotent (`:166-174`); insert `org_channel_members { channel_id, user_id, added_by }` (`:176-187`); `{ ok: true,
  granted: true }`. **No rule for `kind` at all: `guard.channel.kind` is loaded and never read here** (S69 carry-over; D8 adds board / lounge /
  event -> 409 `room_locked`). No `code` in any answer.
### 12.2 `members/[userId]/route.ts` (47 lines) — `DELETE`: `requireNotRestricted`, `loadClubOfficer(slug, user.id, { channelId })`, service-role
delete from `org_channel_members` (`:24-46`); `{ ok: true }`. No kind rule either.
### 12.3 The kinds rules that DO exist today (all 409 `refusalBody("room_locked")`):
`POST …/channels` refuses a core-room name (`channels/route.ts:215-216`, `isCoreRoomName`) and always sends `kind: "room"` (`:237`);
`PATCH …/channels/[channelId]`: event -> everything refused (`[channelId]/route.ts:84`), core room or core name on rename (`:101`), private
purge skipped when kind is known (`:189-192`); `DELETE`: `kind !== "room"` refused (`:225-226`); `reorder`: an event id refused
(`reorder/route.ts:115-116`). `GET …/channels` leaves event rooms out (`channels/route.ts:105`).

## 13. `GET /api/orgs/[slug]` and the hidden-club sweep

### 13.1 `src/lib/orgs/hidden-gate.ts` (42 lines; pure)
`officerGate({ hidden, role, allowed }): "ok" | "not_found" | "forbidden"` (`:30-42`): hidden AND no role -> `not_found`; no role or role not
in `allowed` -> `forbidden`; else `ok`. The order is the rule (`:11-13`): a stranger to a hidden club hears 404; a member who is not an officer
hears 403.

### 13.2 `src/app/api/orgs/[slug]/route.ts` — `GET` (`:240-378`)
`ORG_SELECT = "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy,
school, campus_id, join_policy, audience"` (`:79-80`); `fail(status, code, error, extra?)` = `{ ok: false, error, code, ...extra }` (`:85-92`).
Auth 401 `unauthorized` (`:243-246`); SERVICE-role `orgs` read `${ORG_SELECT}, hidden_at, created_at` by handle (`:248-257`); error -> 500
`load_failed`; no row -> 404 `not_found` (`:258-264`); in parallel `loadViewerOrgContext(service, org.id, user.id)` (`src/lib/orgs/
membership.ts:115`, returns `{ role, pendingInvite, pendingRequest, viewer, removed, ok, error }`), member count (`org_members` head count),
follow reads (`:276-284`); `!ctx.ok` on a hidden club -> 404, else 500 (`:288-299`); `orgJoinState(...)` `not_found` -> 404 (`:301-313`);
answer (`:337-378`): `org: { ...ORG_SELECT columns, logo_url: orgAssetProxyUrl(handle, logo_url, "logo"), banner_url: ...("banner"),
member_count (null when the count failed), org_follow_state, org_follow_source, follower_count, viewer_role: ctx.role, pending_request, hidden:
!!hidden_at, join_state, join_reason, pending_invite }`. **How the sweep answers a stranger 404:** `hidden_at` is read with the service role
and the join decision (`orgJoinState`) returns `not_found` for a hidden club and a non-member (`:311-313`), the same 404 as a missing handle;
**The exact 404 / 403 `members_only` sweep the `space` route copies is `GET /api/orgs/[slug]/channels`
(`src/app/api/orgs/[slug]/channels/route.ts:41-95`):** auth 401 `unauthorized`; service-role `orgs` select `id, hidden_at` by handle
(`:52-57`); missing -> 404 `not_found` (`:65-70`); service-role `org_members.role` for the viewer (`:72-77`); read error -> 500 `load_failed`;
no role -> `org.hidden_at ? 404 not_found : 403 { error: "Channels are for members", code: "members_only" }` (`:85-95`); the channels read
itself stays on the cookie client so `can_view_org_channel` filters the private rooms (`:33-34`). `GET /api/orgs/[slug]/members` answers the
same 403 `members_only` "Members only" (`src/app/api/orgs/[slug]/members/route.ts:79`).

**Where each `OrgRef` field comes from:** `orgs.logo_url` and `orgs.banner_url` are stored R2 keys (`orgs/<id>/…`) or full URLs and become
`/api/orgs/<handle>/asset/<kind>` through `orgAssetProxyUrl(handle, stored, kind)` (`src/lib/org-asset-url.ts:14-27`; null when nothing
stored); `verified` is `orgs.verified` (boolean, coerced `=== true` in `message-read.ts:868` and `threads/route.ts:535`); `handle`, `name`
are `orgs` columns; `hidden_at` is `orgs.hidden_at` (service-role reads only: `orgs_select` hides a hidden club from non-members,
`rsvp/route.ts:30-34`, `events/[id]/route.ts:67-70`). `member_count` = `org_members` exact head count with the service role
(`orgs/[slug]/route.ts:278-281`). `PATCH` and `DELETE` on the same file use `officerGate` directly (`:479-487`, `:782-789`).

## 14. `GET /api/me/features` — `src/app/api/me/features/route.ts:24-36`
Auth 401 with `Cache-Control: private, no-store` (`:7`, `:30-32`); `{ ok: true, chat_v2: await chatV2For(user.id) }` (`FeaturesResponse`,
`types.ts:149`) with `no-store` (`:34-35`). No rate limit, no gate, no 500 of its own (`:21-22`). D5's "once per mount" read.

## 15. Shared gates

### 15.1 `src/lib/rate-limit.ts` (147 lines; `server-only`)
`export type RateLimitResult = { allowed: boolean; retryAfterSec: number }` (`:19-23`). `export async function rateLimit(key: string, opts: {
limit: number; windowSec: number; failClosed?: boolean }): Promise<RateLimitResult>` (`:25-49`): service-role rpc `rate_limit_hit({ p_key,
p_limit, p_window_seconds })`; fail-open unless `failClosed`. `export function tooManyRequests(result, message = "Too many requests. Try again
shortly.")` (`:133-147`): a plain `Response` 429 `{ ok: false, error: message }` with `retry-after` — NO `code`. Also `clientIp`,
`clientNetworkKey`, `networkBucket` (`:52-93`).

### 15.2 `src/lib/moderation/access.ts` (357 lines; `server-only`)
`getActiveRestriction(userId): Promise<{ ok: true; restriction: ActiveRestriction | null } | { ok: false; error }>` (`:89-111`, service role
`account_restrictions`); `accountRestrictedResponse()` 403 `{ code: "account_restricted" }` (`:114-119`); `schoolEmailRequiredResponse()` 403
`{ code: "school_email_required" }` (`:122-127`); **`contentBlockedResponse(field?: string)`** 422 `{ ok: false, error: "That includes words
that aren't allowed on Vibe", code: "content_blocked", field? }` (`:134-144`); `readAccess()` (`:161-191`): `users` consent columns +
`school_verified` with the service role -> `termsRequiredResponse()` (403 `terms_required`), then restriction (fail closed 500), then the
flag; `requireNotRestricted(userId): Promise<NextResponse | null>` (`:203-206`); `requireCanPublish(userId): Promise<NextResponse | null>`
(`:217-221`) = the above + `school_verified`. Blocks and mutes are gated by neither (`:27-28`).

### 15.3 `src/lib/moderation/text-filter.ts` (185 lines; pure)
`export type TextCheck = { ok: true } | { ok: false; category: FilterCategory }` (`:33`); `checkText(text: string | null | undefined): TextCheck`
(`:145-157`; empty is ok; the matched word is never returned); `sameStoredText` (`:164-169`); `checkChangedText(next, previous)` (`:179-185`).

## 16. `src/lib/safety/pair-block.ts` (230 lines; no server-only, no `@/` imports) — every export
- `isUuid` = the strict RFC copy (`:28-34`).
- `export type PairBlock = { ok: true; blocked; viewerBlockedTarget; targetBlockedViewer } | { ok: false; error }` (`:38-40`).
- `pairBlockFilter(viewerId, targetId): string` (`:45-50`), `loadPairBlock(client, viewerId, targetId): Promise<PairBlock>` (`:65-101`): the
  VIEWER's client, `blocks` select `blocker_id, blocked_id` with the `.or()` of both directions; self -> all false; non-uuid -> `{ ok: false }`.
- `export type AnyPairBlock = { ok: true; blocked: boolean } | { ok: false; error }` (`:105`).
- `blockPairFilter(viewerId, peerIds): string | null` (`:113-120`): `and(blocker_id.eq.<v>,blocked_id.in.(<ids>)),and(blocked_id.eq.<v>,
  blocker_id.in.(<ids>))`; null on any non-uuid or an empty list.
- `loadAnyPairBlock(client, viewerId, peerIds): Promise<AnyPairBlock>` (`:126-142`): `blocks` select `blocker_id` `.or(filter).limit(1)` — a
  yes/no, NOT the pairs.
- `dmSendBlocked(supabase, channelId, viewerId): Promise<AnyPairBlock>` (`:154-173`): `channel_members` peers then `loadAnyPairBlock`.
- `groupBlockFilter(newIds, existingIds)` (`:196-207`), `loadGroupBlockConflict(service, newIds, existingIds)` (`:215-230`): SERVICE client, a
  yes/no.
**How a route learns the block pairs between a viewer and a list of ids in ONE read:** no helper returns the pairs for N peers today. The
closest are `loadHiddenUsers(supabase, viewerId)` (`src/lib/safety/hidden-users.ts:26-58`, cookie client): ONE `blocks` read `.or(
blocker_id.eq.<v>,blocked_id.eq.<v>)` (every block the viewer is in, either way, `:31-34`) plus one `mutes` read, returning `{ blocked:
Set<string>, muted: Set<string>, ids: string[] }` — the set of blocked ids can then be intersected with a page's author ids in memory (this is
what `threads/route.ts:716-738` does); or `blockPairFilter(viewerId, ids)` with `.select("blocker_id, blocked_id")` and no `limit(1)` (a new
helper, same module per its header rule `:7-8`). RLS `blocks_select_either` shows the viewer exactly their own pairs (`:16-18`).

## 17. Clients and the client-side request helper
- `src/lib/supabase/server.ts:16-35`: `createSupabaseServerClient(): Promise<SupabaseClient>` (async; `cookies()` awaited; anon key +
  cookie session, RLS applies).
- `src/lib/supabase/service.ts:17-28`: `createSupabaseServiceClient(): SupabaseClient` (sync; THROWS `"Missing SUPABASE_SERVICE_ROLE_KEY"`,
  `:6-12`); `isSupabaseServiceConfigured(): boolean` (`:26-28`).
- `src/lib/feedback/request.ts`: `export type VibeFailure = { ok: false; status: number; code: string | null; error: string | null; message:
  string; action?: ToastAction; field?: string }` (`:37-51`); `VibeResult<T> = { ok: true; status; data: T } | VibeFailure` (`:53`);
  `vibeRequest<T>(url, init: VibeRequestInit)` (`:138-178`): never throws; `json` sets the body and content-type; a body without a method
  defaults to POST (`:154`); a non-2xx or `ok: false` body -> `fail()` (`:115-130`) with `describeFailure(signal, failure, here())` and a toast
  unless `quiet`; `field` passed through (`:100-112`). Also `copyText` (`:209-228`), `downloadFile` (`:291-332`).

## 18. Database facts the routes lean on (from migration files; nothing was run)

- `can_post_org_channel(cid, uid, root)` (`supabase/migrations/20261001100000_chat_v2_rooms.sql:1362-1394`): `security definer`, `set timezone
  to 'UTC'`; anon -> false; authenticated asking about someone else -> false; not `can_view_org_channel` -> false; board + null root -> owner/
  admin; board + root -> a live top-level post of that Board; any other kind with a root -> false; event -> `now() < ends_at + 7 days`; lounge /
  officers / room -> true; a missing room -> false (`coalesce`). EXECUTE granted to anon, authenticated, service_role (`:1399`).
- `can_view_org_channel(cid, uid)` (live body in `wave-1-asis.md:485-521`): membership in `org_members` is the whole gate; public -> true;
  owner/admin -> true; else the `org_channel_members` allow-list; NULL for an unknown channel; does not look at `hidden_at`, blocks or
  `channel_members`. The service role may ask about any uid (`filterRoomReaders` relies on it).
- `is_blocked_either_way(viewer_id, other_id)` (`20260922120000_t2_notification_writes_and_helper_grants.sql:484-500`): `security definer`;
  anon -> false; authenticated where NEITHER id is `auth.uid()` -> false; else `exists` over `blocks` in either direction. EXECUTE to anon,
  authenticated, service_role (`:539`). It answers one pair per call; D2's after-launch clause (`NOT is_blocked_either_way(auth.uid(),
  user_id)`) would run it once per row inside `messages_select_org_member`.
- Messages policies after migration A: `messages_insert_org_member` WITH CHECK = own row, `kind = 'text'`, `card_event_id is null`, no media, no
  removed_*, `can_post_org_channel(c.id, auth.uid(), messages.thread_root_id)`, consent, `can_publish_now()` (`:1409-1420`);
  `messages_insert_member` = own row, text, no card, `thread_root_id is null`, no removed_*, a channel_members row on a non-club channel, no block
  pair with any peer, consent, publish (`:1422-1440`). So a direct client insert can never create a `poll` / `event_card` row: migration B's RPCs
  (service role) are the only writers of cards. SELECT policies are untouched by A (`:1403-1405`): `messages_select_org_member USING
  ((removed_at IS NULL OR user_id = auth.uid()) AND can_view_org_channel(...))` (`wave-1-asis.md:279-282`) — no block clause (D2).
- Columns A added (`:705-736`): `channels.kind, channels.event_id`; `messages.kind text not null default 'text'`, `messages.thread_root_id
  (references messages ON DELETE CASCADE)`, `messages.card_event_id (references events ON DELETE SET NULL)`; constraints `messages_kind_check
  IN ('text','poll','event_card')`, `messages_card_event_shape (card_event_id is null or kind = 'event_card')` (`:840-845`). An Event card whose
  event is cancelled keeps its row with `card_event_id` null (contract 5: `event: null`).
- `channel_members` columns (asis 1.3): `accepted_at, last_read_at, hidden_at, pinned_at, typing_until, muted_until, cleared_at`; unique
  `(channel_id, user_id)`; no INSERT policy (rows are made by the service role and, since A, the room triggers). `rsvps` (asis 1.6): `id,
  event_id, user_id, status IN (going, maybe, no), created_at`, unique `(event_id, user_id)`.
- Triggers A added on existing tables (contract 15 / the file): `chat_events_room` on `events` (function `:1140`, trigger `:1183`) and `chat_rsvps_room` on `rsvps` (function `:1065`, trigger `:1180`)
  make and fill event rooms; `chat_repair_club(p_org)` (`:1202`) creates Lounge/Board/Officers. D3's `chat_votes_drop_access` is the one trigger
  B adds to an existing table (`channel_members`).

## 19. Next.js 16 conventions (from `wave-1-asis.md:1541-1597`, verified against the routes read here)

1. `context.params` is a Promise: every route here types `{ params: Promise<{...}> }` and awaits it (`messages/route.ts:56,84`;
   `[messageId]/route.ts:5,17`; `rsvp/route.ts:10,131`; `orgs/[slug]/route.ts:241`; `channels/[channelId]/members/route.ts:7,48`).
2. `cookies()` is async-only: `createSupabaseServerClient` awaits it (`server.ts:17`) and every route awaits the client.
3. The proxy is `src/proxy.ts` (`export async function proxy`, `:222`); for a restricted session it refuses every non-GET `/api/*` except a short
   list (asis 10), so new POST/PUT/DELETE chat routes are covered without a proxy change, and the route gates stay required.
4. Error bodies: chat routes answer `refusalBody(code)` for section 6.0 codes; older routes answer `{ ok: false, error }` with or without
   `code` (the thread routes: none; events/orgs: `code`; `tooManyRequests`: none; `contentBlockedResponse`: `content_blocked` + `field`).
5. `NextResponse.json(body, { status, headers })` everywhere; `after()` is not used in these files (the push enqueue returns at once,
   `messages/route.ts:513-518`).
6. Repo docs to read before writing a route: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (params,
   `:82-103`), `02-guides/upgrading/version-16.md` (asis 10).

## 20. Contradictions with `wave-1-contracts.md` sections 4-7 and `types.ts` (facts, not opinions)

1. Contract 6.1 says `?after=` answers `400 "Invalid after"`; the code does so in TWO places with no `code` (`messages/route.ts:115`,
   `message-read.ts:711`). D4's `invalid_after` must change both (a card route calling `readChatMessages` would otherwise answer the old body).
2. Contract 6.1 says `reply_count` is "one grouped count over the page's post ids"; the code walks reply rows in pages of 1,000 with a 5-page cap
   and answers null past it (`message-read.ts:390-438`). D3 closes this.
3. `types.ts:251` says `card` is "Always null in wave 1" and `:257-269` says a stub's `content`, `user_id`, `users` are "NOT PINNED YET"; the
   type requires `content: string, user_id: string, users: Person | null` (`:234-244`), so D1's stub (`content: ""`, `user_id: ""`, `users:
   null`) fits the type as written; `hidden: false` is hard-coded at `message-read.ts:578`.
4. Contract 6.3 says the remove route checks "an OPEN report on this message → 409 `report_open`" and names no lookup; the only open-report
   readers are private to `reports/route.ts` (`alreadyOpen`, `openReportCount`) — the remove route needs its own query (section 9) or an export.
5. Contract 6.3 says `RemovedContentCard` is at `ReportSheet.tsx:658` with props `kind, removedAt, removedReason, compact` (`:658-673`); it has no
   `by` prop and prints "Removed by Vibe moderators" plus an email/Guidelines line (`:686, :698-703`). D9 adds `by`.
6. Contract 7 says the calendar's `room_id` is "set only when I may enter the room"; the calendar route reads on the cookie client with no room
   or membership lookup (`calendar/route.ts:75-86`) and its `org` embed is null for a private club the viewer is not in — `org_id` needs a
   service-role or `events.org_id` select, and "may enter" needs `can_view_org_channel` or a `channel_members` check per room.
7. Contract 7's 403 `members_only` for `GET /api/orgs/[slug]/space` already exists as a pattern (section 13.2, `channels/route.ts:85-95`,
   sentence "Channels are for members"); `officerGate` itself only knows `not_found | forbidden` (`hidden-gate.ts:28`), so the space route
   copies the channels list's inline sweep, not the gate.
8. Contract 5 says the Event card's Going / Maybe call `PUT` / `DELETE /api/events/[id]/rsvp` "then the screen re-reads the message"; the PUT
   requires `requireTermsAccepted` (not the restriction gate) and refuses 403 `campus_visiting` off-campus unless a club member
   (`rsvp/route.ts:97-115`); `viewer_status` cannot be `no` through the route (`:161-163`), matching `EventRef.viewer_status` (`types.ts:50`).
9. Contract 4.4 says card routes gate "`ensureMember` (403/404)"; `ensureMember` never answers 404 (403 or 500 only, `channel-access.ts:59,86,
   99,108,110,144,146`).
10. Contract 6.4 / `types.ts:322`: `ThreadEntryRoomFields.can_post` for a Board is computed in TypeScript from the role (`threads/route.ts:801`),
    not from `can_post_org_channel`; the thread GET's `viewer.can_post` IS the database's answer (`message-read.ts:1033`). The two can differ
    for an event room past its window (list: true; thread: false).
11. Contract 6.1 says the thread read "re-reads `room`/`viewer` on every poll" is to be avoided; the route has no way to skip `describeRoom`
    (no query param), so D7's every-5th rule is client-side only unless the route gains a switch.
12. `ThreadMessagesResponse.peer_typing` is typed `unknown[]` (`types.ts:304`); the dm/group branch sends `{ user_id, handle, name, avatar_url }[]`
    (`messages/route.ts:208-215`).

## 21. Surprises (short; each one line)

- `src/app/api/events/[id]/route.ts` has NO GET: nothing reads one event by id for a member (only DELETE/PATCH for officers, `:144, :272`).
- `GET /api/events/[id]/attendees` names people only to `can_manage_event` (`attendees/route.ts:61-70`); a member's "8 going" must keep using the service-role path of `message-read.ts:881-922`.
- `PUT /api/events/[id]/rsvp` returns `{ ok: true }` only (`rsvp/route.ts:179`) and uses `requireTermsAccepted`, not `requireNotRestricted` (`:150`).
- `POST …/channels/[channelId]/members` loads `kind` through `loadClubOfficer` and never reads it (`members/route.ts:105-190`).
- No helper returns the block PAIRS for N peers; `loadHiddenUsers` (one `blocks` read) is the closest, and it is what the thread list already uses (`threads/route.ts:716`).
- "Invalid after" lives in two places (`messages/route.ts:115`, `message-read.ts:711`), both without a `code`.
- `readChatMessage` does not skip reply counts, so a card read-back on a Board pays the reply-count walk (`message-read.ts:828`).
- `describeRoom` runs `readRoomEvent` (two service-role reads plus the going list) on EVERY thread poll of an event room (`message-read.ts:1031-1035`).
- `ensureMember` never answers 404, only 403 / 500 (`channel-access.ts:59-146`); contract 4.4 writes "403/404".
- `tooManyRequests` and the thread routes' errors carry no `code`; `vibeRequest` then maps by status alone (`rate-limit.ts:137-146`, `request.ts:100-112`).
- The thread list's Board `can_post` is a TypeScript role check (`threads/route.ts:801`), the thread GET's is the database's (`message-read.ts:1033`).
- The calendar embeds `org:orgs(...)` under the viewer's RLS with no `org_id` column (`calendar/route.ts:78-81`), so a left private club's event has `org: null`.
- `messages_delete_own` is untouched by migration A: a member can still hard-delete their own club-room message, replies and cards cascading (`chat_v2_rooms.sql:713`, asis 2.2).
- `RemovedContentCard` is exported but "NOT WIRED TO ANY DATA YET" (`ReportSheet.tsx:642-657`); no screen passes it `removed` today.
- The admin remove closes reports and writes `moderation_actions`; the officer route must skip both and still answer `already` for a row removed earlier (`admin/content/remove/route.ts:140-158, :160-193`).
- `chatV2For` is never cached and does one `org_members` read per call when clubs are listed (`flag-server.ts:14-16, :93-98`); the inbox + threads + space reads on one screen mount would ask it three times unless the routes share nothing.
