# Critique of `wave-2-contracts-draft1.md` — lens "routes" (2026-09-30, cloud session)

Read-only review of the HTTP contract and route security in the draft (sections 1.3, 2, 4, 5, 6, 7, 8, 9, 12) against the repo at HEAD `15a8286`, `src/lib/chat/types.ts`, the routes-map (`wave-2-asis/routes-map.md`, RM), the database-map (DM), `wave-1-contracts.md` (sections 4, 5, 6.1–6.4, 7, 14–16) and `wave-0-decisions.md`. Nothing was run: no database, no HTTP; every code claim is a `path:line` read with `cat -n` / `sed -n`. Other lenses' ground (SQL bodies, screens, the split, the schedule) is left alone except where a route fact adds evidence.

## Verdict

**Buildable after the changes below.** The gate orders, the client choice per read, the 404/403 sweep, the remove route's order and the report-snapshot shape all hold against the code. What does not hold: (1) the block stub, as written, also hides dm and group messages and adds a `blocks` read and a new 503 to every dm poll, which contradicts the draft's own "flag off changes nothing but club-room stubs"; (2) the vote route cannot be built as written (its hydrate call needs a block set and two columns that no earlier step reads); and a handful of payload rules the reads leave undefined (a room with no `channel_members` row, a shared preview window that starves the Board, `board_latest` through a helper that cannot report a failed hydrate, the Share-an-event list on a hidden club).

Counts: **2 HIGH, 5 MEDIUM, 9 LOW.**

**The top changes**

1. **Scope the stub to club rooms** (H1): `blockedIdsFor` and `isHiddenFrom` run only when `room !== null`; a dm or group page never reads `blocks` and never stubs; 8.3's first row and 8.5 say so.
2. **Make the vote route buildable** (H2): step 9 selects `id, kind, user_id, card_event_id, removed_at`; `removed_at` set → 404; a `blockedIdsFor` step before the hydrate; `hydrateCards` gets the real row.
3. **Two preview reads in the inbox, one per room kind** (M1), as the thread list already does for the same starvation.
4. **Pin `unread: false` for a room the viewer holds no row on** (M2) — the Officers room and private rooms have no `channel_members` rows.
5. **`board_latest` through `readChatMessages`, not `toChatMessages`** (M3), so a failed hydrate is a 503 and the block set is applied.

Severity: **HIGH** = built literally it breaks something, leaks something, or a batch cannot finish. **MEDIUM** = real rework, a missed file, or a payload a screen cannot use. **LOW** = wording to pin.

---

## HIGH

**ROUTES-H1. The stub rule, as written, also stubs dm and group messages, and every dm page pays a `blocks` read and gains a 503.**
- Evidence:
  - Draft 9.1: "`readChatMessages` and `readChatMessage` call `blockedIdsFor(client, viewerId)` first; `null` → 503 `try_again`", with no room condition; `readChatMessages` serves dms and groups too (`messages/route.ts:130-139`, `:166-229`).
  - Draft 8.2: `hidden = blocked.has(row.user_id) && !(room?.kind === "board" && …)` — with `room === null` (a dm or a group, `message-read.ts:647`) this is `blocked.has(user_id)`: every message from a blocked peer in a group chat becomes a stub. Draft 8.3's first row lists the thread GET with no "club rooms" qualifier.
  - Draft 8.5: "The DM path is unchanged"; draft section 0: with the flag off "nothing" changes "with ONE exception … a club-room message by someone in a block pair". Draft 12.1 makes the four old renderers skip stubs flag-independently, so with the flag off a blocked person's messages vanish from every group chat on desktop and phone.
  - Today a group with a blocked member stays visible with all its messages (`threads/route.ts:730-738`: "Groups stay visible (per-message filtering is a future polish)"); the dm send is refused by `dmSendBlocked` (`:420-435`) but reading is not.
  - Cost: the old screens poll dms every 2 s (BN:3 B4 F2); a `blocks` read per poll, and a failed `blocks` read now answers 503 where today the page loads.
- Change (9.1, 8.2, 8.3, 8.5):
  - 9.1: "`blocked` is read only for a club room: `readChatMessages` / `readChatMessage` call `blockedIdsFor` when `room !== null`; for a dm or a group `blocked` is the empty set and no `blocks` read is made. `null` from the read → 503 `try_again` (club rooms only)."
  - 8.2: `hidden = room !== null && blocked.has(row.user_id) && !(room.kind === "board" && row.thread_root_id === null && authorRole ∈ BOARD_POSTER_ROLES)`; `isHiddenFrom` returns false whenever `room` is null (tested).
  - 8.3 first row: "`GET …/messages` **in a club room** (top-level page, `?after=`, `?before=`, `?root=`)". 8.5 gains: "A dm or a group never carries a stub; `hidden` stays false there, as in wave 1."
  - If Franky wants blocked people hidden inside group chats too, that is a separate open point (14.x) with its own old-screen consequences, not a side effect of 8.2.

**ROUTES-H2. `PUT …/vote` cannot be built as written: the hydrate step needs a block set and two row fields that no earlier step reads.**
- Evidence:
  - Draft 4.3 step 9 re-reads `messages` select `id, kind, removed_at`; step 11 calls `hydrateCards([{ id: messageId, kind: "poll", user_id }], user.id, { room, blocked })`. `user_id` is not selected in step 9; `CardRow` (draft 5.2) requires `card_event_id` too; and nothing in steps 1–10 reads `blocked` (5.4's `blockedIdsFor` is named in 4.1.13 through `readChatMessage`, never in 4.3). `options[].voters` minus `blocked` (5.2) is therefore undefined for the vote answer. Draft rule (top of the file): a batch that finds the contract wrong "stops and says so; it does not improvise".
  - Step 9 selects `removed_at` and never uses it: the viewer's own removed poll comes back through `messages_select_org_member` (`(removed_at IS NULL OR user_id = auth.uid())`, wave-1-asis `:275-278`) with `kind = "poll"`, so the route would call the RPC and get `P0C24` (draft 3.4 `:386-389`) — the right answer by luck of the second wall, not by the contract.
- Change (4.3):
  - Step 9: "`messages` select `id, kind, user_id, card_event_id, removed_at` where `id = messageId and channel_id = channelId` `.limit(1)`; no row, `kind !== "poll"`, or `removed_at !== null` → 404 `not_found`."
  - New step 10: "`blocked = await blockedIdsFor(supabase, user.id)` (5.4) → `null` → 503 `try_again`."
  - Step 12 (was 11): "`hydrateCards([row], user.id, { room, blocked })` with the row of step 9 → no card → 503 `try_again` → `200 { ok: true, card }`."
  - 5.2's `CardRow` note: "the vote route hands it the row of 4.3.9".

---

## MEDIUM

**ROUTES-M1. The inbox preview window is shared by every Board and Lounge, so a busy Lounge starves the Board's `latest` while `board.unread` says there is a post.**
- Evidence:
  - Draft 7.1.4: ONE `messages` read over "all board + lounge ids", `order created_at desc`, `limit(ids.length * 5)`, "per room, the newest row"; the draft admits "a room busier than 5 messages … shows null; accepted", but the starvation is across rooms: with 2 rooms the window is 10 rows, and 10 Lounge messages since the last Board post leave the Board with `latest: null`.
  - `board.unread` (7.1.5) is a separate head count, so the row then reads "unread Board, no preview"; draft 1.2's club row rule ("the coral dot + `Board: <text>` when the Board is unread") has no text to show. The Board is officer-only and quiet by design, the Lounge is not: this is the common case, not the edge.
  - The thread list split its own window for exactly this reason (`threads/route.ts:646-651`: "in one shared window busy club rooms could push a dm's last message out of it"; two reads at `:689-692`).
- Change (7.1.4): "Two preview reads, each `order created_at desc` `limit(ids.length * 5)`: one over the Board ids, one over the Lounge ids (the thread list's pattern, `threads/route.ts:646-692`). Per room, the newest row that is not a stub for me; nothing in a room's window → `latest: null`." Keep the accepted note for the within-room case.

**ROUTES-M2. `SpaceRoom.unread` is undefined for a room the viewer holds no `channel_members` row on (the Officers room, a private room), and mark-read is a no-op there.**
- Evidence:
  - Draft 7.2.3: "My `channel_members` rows for those ids … Per room: `unread` = the service-role head count of 7.1.5 `> 0` (for `event`, `officers` and `room` kinds too)"; 7.1.5 counts `created_at > <my last_read_at ?? my row's created_at>`. There is no row for Officers: `chat_channels_subscribe` writes rows for event rooms and public rooms only ("An Officers room or a private room: nothing", `20261001100000_chat_v2_rooms.sql:905-938`); DM:8.4 and draft 3.5 say the same. Owners/admins enter Officers by role (`can_view_org_channel`, A:1319-1348), never by row.
  - `POST /api/me/threads/[id]/read` is an `update` on the row (`read/route.ts:19-23`), never an upsert (`authenticated` has no INSERT grant on `channel_members`, DM:5.4), so the new screens cannot create one either.
- Change (7.2.3): "A room with no `channel_members` row for me (Officers; a private `room` I enter by role or by the allow-list) → `unread: false`; the Officers chip never carries a dot in v1. 11.5's mark-read call is skipped for such a room." Add to 14 as an open point (default: no unread signal on Officers until rows exist there).

**ROUTES-M3. `board_latest` through `toChatMessages` cannot answer a failed hydrate, and no `blocked` reaches it.**
- Evidence:
  - Draft 7.2.4: `toChatMessages(supabase, rows, { channelId: board, viewerId, room, skipReplyCounts: false })` → "9.1 gives cards, stubs and `reply_count`". `toChatMessages` is `buildChatMessages(...).messages` (`message-read.ts:522-528`): the `complete` flag that 9.1 turns into a 503 ("`null` from hydrate → `complete: false` → 503") is dropped, so the space route would send a poll with `card: null` on a failed side-table read — the case 5.2 forbids ("never a page with a card-less poll").
  - 9.1 puts the `blocks` read in `readChatMessages` / `readChatMessage`, not in `buildChatMessages`; `toChatMessages` has a third caller today (`messages/route.ts:601`, the send answer) and the space route would be a fourth; neither is given `blocked`, so a stubbed Board row would come through un-stubbed in `board_latest`.
- Change (7.2.4 and 9.1):
  - 7.2.4: "`readChatMessages(supabase, board.id, { limit: 6 }, { viewerId: user.id, access: <the Board's ChannelAccess built from the sweep: { ok: true, isOrgChannel: true, orgId: org.id, accepted_at: null, cleared_at: null, kind: "board" }>, room: <the Board's Room from loadRoom> })` → `!ok` → its `status` and `body`; the first message that is not `hidden` → `board_latest`." (`readChatMessages` clamps, reads roles, reply counts, cards and stubs, and answers 503 on an incomplete page, `message-read.ts:772-781`.)
  - 9.1: "`buildChatMessages` reads `blockedIdsFor` itself when `ctx.blocked` is absent and `room !== null`, so every caller of `toChatMessages` (the send answer at `messages/route.ts:601` included) applies the rule; the thread GET passes the set it already read."

**ROUTES-M4. The Share-an-event sheet reads `GET /api/events?org_id=`, which answers `[]` for a hidden club to everyone, its members included.**
- Evidence: draft 11.7 "`Upcoming events` = `GET /api/events?org_id=<org.id>&limit=50`"; `src/app/api/events/route.ts:212-216`: "A hidden org has no event list, for anybody … `if (!isUuid(orgIdFilter) || hiddenOrgIds.has(orgIdFilter)) return answer([])`". A member of a hidden club opens the sheet and meets `No upcoming events.` with the CTA disabled (11.7), while the card RPC would accept the event (3.4 checks `e.org_id = v_org and e.ends_at > now()`, no `hidden_at`). The space route itself answers 200 to that member (7.2's sweep: a member of a hidden club passes).
- Change (11.7, 7.2, W2-B4): either (a) additive on the space read — "`GET /api/orgs/[slug]/space?events=1` also answers `upcoming: EventRef[]` (service role, `ends_at > now()` order `starts_at asc` limit 50, through `eventRefsFor`); the sheet reads it (one read, the club already loaded)"; `SpaceResponse` gains `upcoming?: EventRef[]` in `types.ts` (additive, W2-B2's edit) — or (b) `GET /api/events?org_id=` answers a member of the hidden club (a service-role `org_members` read, the channels-list sweep's rule `channels/route.ts:72-95`). Default (a): it touches no campus route. Say which in 11.7.

**ROUTES-M5. `readGoing`'s block filter has no way to get the block set: `describeRoom` does not take one, and 9.1 reads it inside the page read only.**
- Evidence: draft 8.3 row `room.event.going`: "blocked ids are left out at the per-step filter (`candidates = step.filter(id => members.has(id) && !blocked.has(id))`)". `readGoing` is called from `readRoomEvent` ← `describeRoom(client, room, viewerId)` (`message-read.ts:1026-1035`, `:983`), which the route runs in parallel with `readChatMessages` (`messages/route.ts:130-138`); neither signature carries `blocked`, and 9.1 puts the one read inside `readChatMessages`. Built literally: either `readGoing` cannot filter, or the GET reads `blocks` twice per poll.
- Change (9.1, 8.3): "The thread GET reads `blockedIdsFor(supabase, user.id)` ONCE (club rooms only, H1) before the `Promise.all`; `null` → 503. It hands the set to `readChatMessages` (`known.blocked`) and to `describeRoom(client, room, viewerId, blocked)`, which passes it to `readRoomEvent` → `readGoing`. `readThreadRoom` (`:1066-1078`, no page) reads it itself." List the signature change under W2-B2's `message-read.ts` ownership (13.2).

---

## LOW

**ROUTES-L1. `readChatMessage` ignores `known.room`; 4.1.13 passes it as if it mattered.**
- Evidence: draft 4.1.13 "`readChatMessage(supabase, id, { viewerId: user.id, room })`"; `message-read.ts:823` `const room = rooms ? await loadRoom(row.channel_id) : null;` — `known.room` is never read (only `known.viewerId` at `:803` and `known.access` at `:825`). The read-back costs one more service `channels` read (+ `events` for an event room), harmless.
- Change (4.1.13): "`readChatMessage(supabase, id, { viewerId: user.id, access: member })` (it loads the room itself, `:823`)"; or W2-B2 makes `readChatMessage` honour `known.room` and says so in 9.

**ROUTES-L2. `invalid_card` carries `field`, but `Refusal` has no such member.**
- Evidence: draft 4.1.6 "400 `invalid_card` with `field` added to the body"; `types.ts:128-132` `Refusal = { ok: false; error; code }`; the sheet reads `field` through `VibeFailure.field` (`request.ts:37-51`, RM:17) so it works at runtime, but the route's body type is not the contract's.
- Change (1.3 or 4.1.6): "`InvalidCardRefusal = Refusal<"invalid_card"> & { field: string }` in `types.ts` (additive; the only refusal with a `field` besides `content_blocked`)."

**ROUTES-L3. Two answers for a non-uuid `[id]`: 403 on the card routes, 404 on the remove route.**
- Evidence: draft 4.0 "a non-uuid `[id]` → 403 'Not a member' (what `ensureMember` answers, `channel-access.ts:59`)"; draft 6.1.1 "a non-uuid `[id]` or `[messageId]` → 404 `not_found`". Nothing breaks; it is two rules for one shape.
- Change (6.1.1): "a non-uuid `[messageId]` → 404 `not_found`; a non-uuid `[id]` falls through to step 2's cookie read (0 rows) and step 3's `ensureMember` → 403 'Not a member', as the card routes and the thread GET (`messages/route.ts:94-97`)."

**ROUTES-L4. The sender's own delete keeps `{ ok: true }`; `RemoveMessageResponse` is only the moderator's answer — say so, and pin the dm "no row" change.**
- Evidence: draft 6.1.2 "Answer `{ ok: true }` as today" (`[messageId]/route.ts:59`); `types.ts:313` `RemoveMessageResponse = { ok: true; removed: true; already?: true }`. Draft 6.1.3: in a dm with no row the answer moves from today's 404 "Message not found" (`:40-42`) to 403 `not_allowed`; no old screen matches on that 404 (grep of `MessagesMobile.tsx`, `messages.html`, `_miniMessenger.js`, `campus-home.tsx` for the delete answer finds none), so it is safe.
- Change (6.1): "The sender's own delete answers `{ ok: true }` (unchanged; the new screens read `ok` only). `RemoveMessageResponse` is the moderator's answer. A dm or a group with no readable row answers 403 `not_allowed` (was 404 'Message not found'; no screen reads it)."

**ROUTES-L5. The report snapshot's new columns have no missing-column fallback; on a database without A a message report answers 500.**
- Evidence: draft 5.3 `columns` becomes `"…,kind,thread_root_id"`; `reports/route.ts:295-299` (`one()`): any read error → `"error"` → 500 (`:502-507`, RM:9). A is live on production and local (S69 close), and Preview reads production, so only a rollback of A meets it (draft 3.10 says A's rollback comes after B's).
- Change (5.3): "On `isMissingChatSchema(error)` the message spec is read again with today's six columns and `card: null` (the 3.10 table gains the row 'report snapshot → today's columns')."

**ROUTES-L6. `eventRefsFor` reads every going/maybe RSVP of every event for the calendar, which sends none of the counts.**
- Evidence: draft 7.3 hands "the rsvp events" (30 days back to 180 ahead by default, `calendar/route.ts:66-72`) to `eventRefsFor`, whose first read is `rsvps … status in ('going','maybe')` over the whole list "up to 500 rows per chunk with `count: "exact"`, the counts asked apart past the cap" (5.5) — two head counts PER EVENT once a chunk of 100 events has more than 500 RSVPs. `CalendarRoomFields` (`types.ts:362-366`) is `org_id, room_id, room_state` only; `viewer_status` is the row's own.
- Change (5.5, 7.3): "`eventRefsFor(events, viewerId, { counts?: boolean })`: with `counts: false` the `rsvps` read is skipped and `going_count` / `maybe_count` / `viewer_status` are 0 / 0 / null; the calendar calls it so (it needs `channels`, `channel_members` and `org_members` only)."

**ROUTES-L7. The inbox's `next_event` read has no limit.**
- Evidence: draft 7.1.6 "`events` … where `org_id in (…)` and `ends_at > now()` order `starts_at asc` → the first per club" — every future event of every club comes down to pick one each (5 clubs in production today, RM:21 on scale).
- Change (7.1.6): "`limit(clubs.length * 10)`, then the first per club; a club whose next event falls outside the window shows `next_event: null` (accepted)." Or one read per club with `limit 1` (clubs are few).

**ROUTES-L8. `Preview.author_name` is `""` when the author's `users` row is not visible; say what the row shows.**
- Evidence: `users_select_authenticated USING user_visible(id)` (`20260923090000_moderation_foundation.sql:2330, :3046`) hides a restricted account from the cookie client, so the `users(name)` embed of 7.1.4 is null; draft 7.1.4 maps it to `""`; draft 1.2's club row prints `<Author>: <text>`.
- Change (7.1.4 / 1.2): "`author_name: ""` → the row shows the text alone (no `: `)." (Same treatment `toPerson` gives a null name, `message-read.ts:484-488`.)

**ROUTES-L9. Counts include stubs (accepted by D1): write the visible consequence down once.**
- Evidence: draft 7.1.5 "Blocked people's messages count (D1: counts unchanged)"; 8.3 "`unread`, `unread_count` … unchanged". A Lounge whose only new messages are from a blocked person shows `3 new` and opens to nothing new; the mark-read on open clears it. `board.unread` can only come from a demoted officer's post (members cannot post top-level; a current officer's post is never a stub).
- Change (14, new row): "Unread counts include stubbed messages (D1). A Lounge can say `N new` for messages the viewer will not see; opening it clears the count. Accepted for v1; the alternative (subtract stubbed rows: one more read per club) is after launch."

---

## Holds (checked against the code; no change needed)

1. **Card POST gate order (4.1)** matches the send route's: rate limit (`message-send`, `messages/route.ts:248-249`) before `requireCanPublish` (`:254-255`) before JSON (`:257-262`), the word filter before `ensureMember` (`:288` vs `:344`); `ensureMember` answers 403 or 500, never 404 (`channel-access.ts:59, :86, :99, :108, :110, :144, :146`), as 4.1.8 says (fixing wave-1 contract 4.4's "403/404", RM:20.9).
2. **`refuse()` and `POST_REFUSAL_STATUS`** are as 4 cites (`messages/route.ts:59-69`); `postRefusal(room, null, role)` for `P0C21` gives `board_officers_only` / `room_closed` with 403 (`:64-69`, `room-rules.ts:112-126`).
3. **`roomOf` (4.1.10)**: `{ null, false }` for a dm or a null `kind`, `failed` when `loadRoom` answers null with a kind (`message-read.ts:643-650`; `loadRoom` never throws, `rooms.ts:130-183`).
4. **Vote route gates (4.3.1-8)**: `requireNotRestricted` includes the Terms half (`access.ts:161-206`), matching the RSVP route's `requireTermsAccepted` (`rsvp/route.ts:150-151`); the cookie re-read scoped to `[id]` is the right wall (RLS `messages_select_org_member`, wave-1-asis `:275-278`); the RPC's `P0C24` is the second.
5. **The RSVP route as 4.3 describes it**: `requireTermsAccepted`, `rsvpBlocked` (404 `not_found`, hidden org 404, 403 `campus_visiting` unless a member), body `{ ok: true }` only (`rsvp/route.ts:130-180`, `:38-116`); `?after=` is `>=` and oldest first (`message-read.ts:737, :743, :745`), so the re-read of one message by its `created_at` with `limit=1` returns that row first.
6. **`hydrateCards` only on viewer-scoped rows (5.2)**: its two callers are `buildChatMessages` (rows from the cookie read, `message-read.ts:739, :772`) and the vote route's cookie re-read (4.3.9, with H2); `buildChatMessages` drops others' removed rows first (`:533`).
7. **The report snapshot (5.3)**: the message spec is at `reports/route.ts:318-325`; `readTarget` reads on the reporter's client (`:291-301`); the open-report lookup shape the remove route copies is `openReportCount` (`:419-440`) with the `NEW_REPORT_COLUMNS` fallback (`:432-433`).
8. **The remove route's order (6.1)**: cookie lookup scoped to `[id]` (today's `:30-35`) → own row hard delete (today's `:50-59`) → `ensureMember` → rate limit + restriction → `roomOf` → role in `ROOM_MODERATOR_ROLES` BEFORE `outranks` (wave-1 contract 14.10) → service read of `id, user_id, removed_at` scoped to `[id]` → `already` → `outranks` (`room-rules.ts:67-71`) → open report → the guarded update (`removed_at is null`). This is wave-1 contract 6.3's order with 14.10 applied; `authenticated` has no UPDATE on `messages` (DM:5.4, asis 3.1), so the service role is the only writer. No `moderation_actions` row (RM:10).
9. **D8 (6.3)**: `guard.channel.kind` is loaded by `loadClubOfficer` (`officer-guard.ts:122-135`, returned at `:155`) and never read in POST (`members/route.ts:105-135`); the three-line guard after `requireChannelStaff` (`:113-114`) is the B1b-routes-review-http F1 fix (BN:C5). `room_locked` = `refusalBody` sentence (`types.ts:123`).
10. **`invalid_after` (9.2)**: exactly two sites, both without a code (`messages/route.ts:112-118`, `message-read.ts:709-713` via `failed()` at `:628`); `cleanAfterParam` (`:326-332`) is untouched; `ReadFailure.body` already admits a `Refusal` (`:606-610`), so a `refusal("invalid_after", 400)` helper next to `postMissing` / `tryAgain` (`:629-630`) fits once `invalid_after` joins `RefusalCode`.
11. **The space sweep (7.2)** is the channels list's, line for line: service `orgs` by handle → 404 `not_found` (`channels/route.ts:52-70`), service `org_members.role` → 500 `load_failed` / `hidden_at ? 404 : 403 members_only` (`:72-95`); `orgs_select` would hide a hidden club from a non-member on the cookie client, which is why the sweep is service-role (`:28-34`). `rooms` on the cookie client is filtered by `channels_select_org_member` = `can_view_org_channel` (wave-1-asis `:232-233`; A:1319-1348: Officers by role or allow-list, event rooms by row or role). `type = 'org_channel'` is the rooms filter: A's constraint `(type = 'org_channel') = (kind is not null)` (`20261001100000:830`).
12. **The inbox (7.1)**: the `channel_members` cookie read is the thread list's (`threads/route.ts:436-451`); `orgs` and `org_members` on the cookie client with fail-closed 500 is `:507-519`; `channel_members.created_at` exists (`20260430190000_phase1_initial_schema.sql`, `CREATE TABLE public.channel_members … created_at timestamptz NOT NULL DEFAULT now()`), so "a null `last_read_at` is read as the row's `created_at`" is computable; A wrote `last_read_at = now()` on every row (`20261001100000:905-938`). `last_activity_at` computed from previews and the viewer's event rooms, never `orgs.last_activity_at` (`types.ts:343-348`; the RPC insert bumps it, DM:5.3). `blockedIdsFor`'s shape is `loadHiddenUsers`'s one `blocks` read (`hidden-users.ts:30-34`) under `blocks_select_either` (DM:5.1).
13. **The calendar (7.3)**: not gated (wave-1 critique H2, contract 7); today's select has no `org_id` (`calendar/route.ts:78-81`) and the `org` embed is under RLS (RM:8); adding `org_id` as a plain column is what `CalendarRoomFields` needs; `room_id` "only when I may enter" = the `can_view_org_channel` event arm (row or owner/admin), which 5.5 restates from A:1331-1334; a failed `eventRefsFor` → nulls, never 500, is the calendar's own soft-fail habit (`:95-100`).
14. **`chatV2For` (2.1, 7)**: no cache, one `org_members` read per call when clubs are listed (`flag-server.ts:14-16, :92-98`), fail closed (`:99-106`); the features route is `features/route.ts:24-36` (RM:14); the gated routes' 404 is `refusalBody("not_found")` with the new sentence.
15. **Every response shape matches `types.ts`**: `CreateCardResponse` 201 `{ ok, message }` (`:172`), `VoteResponse` `{ ok, card: PollCard }` (`:176`), `PollCardOption` fields all computed in 5.2 (`id`, `label` from the option row), `EventCard` (`:209`), `RemoveMessageResponse` (`:313`), `Preview` (`:326-332`), `InboxClub` / `InboxResponse` (`:334-355`), `CalendarRoomFields` (`:362-366`), `SpaceRoom` / `SpaceResponse` (`:368-390`, `rooms` order as the comment `:382-385`), `FeaturesResponse` (`:149`). The stub (8.1) fits `ChatMessage` (`:231-272`) without a type change. The `ThreadMessagesResponse` shape is unchanged (9).
16. **404 vs 403 leaks**: `event_not_found` is one 404 for missing, foreign and ended (4.1.11, 3.4); the vote route's `[messageId]` from another room is 404 by the scoped re-read; a non-member of a hidden club never learns the club exists (7.2); the flag-off 404 is the same body everywhere.
17. **`readChatMessage` keeps `skipReplyCounts` unset** (`message-read.ts:828`), so a Board card read-back carries its count (9.4); `rootState` checks `thread_root_id` and `removed_at`, not `kind` (`:659-681`), so replies under a Board card pass (9.5).
18. **`readReplyCounts` walk (9.4)** is at `message-read.ts:390-438` with the own-removed `or` (`:402, :416`), the fallback the draft keeps.
