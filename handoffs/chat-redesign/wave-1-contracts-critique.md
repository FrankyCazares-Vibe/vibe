# Critique of `wave-1-contracts.md` (DRAFT 1), 2026-09-29

Read-only review against the repo, the local DB (`docker exec supabase_db_vibe psql`, catalog reads + scratch temp-table experiments inside `BEGIN … ROLLBACK`) and the four input documents. No source file, migration or database row was changed. Production was not queried.

## Verdict

**Not buildable as written; buildable after the changes below.** The database design holds: I could not break the constraints, the cascade pair, the trigger rules or the insert policies in scratch experiments. What fails is around it: the batch order, five existing files the new rows make reachable and nobody owns, one gate that breaks an existing page, a fallback story that is one sentence, and a wave that is too large for three days.

Counts: 5 HIGH, 15 MEDIUM, 16 LOW.

**The top 5 changes**

1. **Re-order and shrink the wave** (H4, Schedule). B0 → migration A alone on the one local database → the rest in parallel. Move all of B2 (cards) and the officer remove route to the Oct 5 week.
2. **Protect the rows the design relies on** (H1, M2). Club rooms cannot be left or declined, a room turned public gets its rows, and one repair function (`chat_repair_club`) does the backfill and any later repair.
3. **Do not gate `/api/me/calendar`** (H2). It is an existing route; desktop "My Calendar" would 404 for everyone without the flag.
4. **Turn media off in club rooms on the server and in the policy** (H3). Wave 1 puts the desktop attach button in front of every club member.
5. **Write the missing-schema table and fix the deploy order** (H5, M1). Nothing reaches `main` before A is applied on production; each changed route has a stated answer when the columns are missing.

Severity: **HIGH** = built literally it breaks something, leaks something, or the batches cannot finish. **MEDIUM** = real rework, a missed file, or a payload the wave-2 screens cannot use. **LOW** = wording to pin.

---

## HIGH

**H1. The old desktop inbox lets any member "Leave group" on a club room, and that deletes the row the whole design relies on.**
- Evidence:
  - `public/html/messages.html:2002` treats `org_channel` as a group; `:3019-3021` draws "Leave group" for every group; the same panel offers rename, photo and "+ Add".
  - `src/app/api/me/threads/[id]/members/[userId]/route.ts:37-66`: when `userId` is the caller it skips the `type = 'group'` test (that test is inside `if (!isSelf)`) and deletes the `channel_members` row with the service role.
  - After 3.7 step 2 every member holds a row on every public room and sees all of them in that inbox (contract section 0, difference 3). Today 5 of 6 local memberships have no row, so almost nobody could reach the button.
  - Nothing re-creates a deleted row by itself: `chat_org_members_rooms` fires on INSERT / role change only, `chat_channels_subscribe` on channel INSERT only. The one way back is the subscribe button on the club page (`src/app/orgs/[handle]/ChannelsSection.tsx:95` → `subscribe-public`): public rooms only, never an event room.
  - Second path, no screen needed: `authenticated` may UPDATE `accepted_at` on its own row (column grant, verified with `pg_attribute.attacl`) and DELETE its own row while `accepted_at IS NULL` (`channel_members_delete_own_pending`, used by `threads/[id]/decline`).
  - That file has no owner in section 11.
- Change:
  - Section 6 (B4 owns the file): "`DELETE /api/me/threads/[id]/members/[userId]`: load `channels.org_id` first; a club room answers 400 `club_room` for self and for others. Add the file to B4's row in section 11."
  - Section 10 (B5): "In `messages.html` and `_miniMessenger.js`, a thread with `room_kind` set hides Leave group, + Add, rename, photo edit and Delete conversation."
  - Section 3.6 (B1): restate `channel_members_delete_own_pending` USING as today's text plus `AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_members.channel_id AND c.org_id IS NOT NULL)`.
  - Section 3.4: add `public.chat_repair_club(p_org uuid)` (service role only, refuse-inside idiom): creates a missing Board, Lounge or Officers room, then re-inserts every missing (member, public room) and (officer or RSVP'd member, open event room) row. Steps 3.2.7 and 3.7 call it per club instead of carrying their own inserts, so the backfill and any later repair are one piece of SQL.

**H2. `GET /api/me/calendar` would answer 404 to everyone without the flag.**
- Evidence: section 2 "What the flag gates: the card routes, the three B3 reads"; section 7 "All three: auth 401 → `chatV2For` 404". One of the three is `/api/me/calendar`, an existing route: `src/components/LeftNav.tsx:467` and `:488` (desktop "My Calendar") call it for every signed-in user.
- Change, section 7: "`/api/me/calendar` is NOT gated. When `chatV2For` is false the three new fields are sent as `null`. Only `/api/me/inbox` and `/api/orgs/[slug]/space` answer 404." Section 2: "the two new B3 reads".

**H3. Wave 1 puts photo and video upload in front of every club member, against "no photos in club rooms in v1".**
- Evidence:
  - `public/html/messages.html:1091-1094`: the attach button is always drawn; `:2527` signs an upload for whatever thread is open.
  - `src/app/api/me/messages-upload-url/route.ts:92` and the POST (`messages/route.ts:402-419`) accept media for any club room the caller can read.
  - wave-0 default: "No photos in club or event rooms in v1 (location stripping comes first, critique #23)". The contract lists photos under "Not in v1" and adds no server rule.
  - The subscription backfill is what makes it reachable: club rooms appear in that inbox for every member.
- Change:
  - Section 6.2, new first row of the gate table: "`media_url` sent to a club room → 400 `club_media_off`".
  - New 6.6 (B4 owns `src/app/api/me/messages-upload-url/route.ts`, add to section 11): "`ensureMember` answers `isOrgChannel: true` → 403 `club_media_off`".
  - Section 3.6, `messages_insert_org_member`: add `AND (media_url IS NULL) AND (media_kind IS NULL)` so PostgREST cannot do it either.
  - Section 10 (B5): "`messages.html` hides the attach button while the open thread has `room_kind`."
  - Pre-flight: count club-room messages with `media_url` set (local 0); record the production count in the header. If it is not 0, stop and ask Franky.

**H4. B1, B2, B4 and B5 cannot run in parallel as section 11 says.**
- Evidence:
  - There is ONE local database. Migration B's pre-flight refuses to run until A is applied (section 4), and A can be applied once (its own "names are free" check). B2 cannot rehearse, and B4 cannot call a single route, until B1's SQL is final.
  - B4 reads `member.kind` / `member.eventId`, but the `ChannelAccess` type lives in `src/lib/messages/channel-access.ts` (B1's file). B0's stub list does not include it, so B4 fails `npm run typecheck` until B1 merges.
  - B2's `201 { message: ChatMessage }` needs `MESSAGE_SELECT`, `hydrateReactions`, `hydrateParentPreviews` and `prepareForClient`. They are private to `messages/route.ts` (only `GET` `:208` and `POST` `:347` are exported), which is B4's file and which B2 "does not edit".
  - Gate 1 wants a node test for `outranks`, but section 8 puts `outranks` in `rooms.ts` next to `loadRoom` / `filterRoomReaders` (service role). `npm test` is plain `node --test` (`package.json:11`): it cannot load a module that imports `@/lib/supabase/service` or `server-only` (asis 9.1).
  - Section 10 scopes B5 in `MessagesMobile.tsx` to "the `ConversationView` composer and send-error handling only", while item 3 sends it into `MessageBubble` (`:4439`).
- Change, section 11:
  - Order: "B0 → **B1a** (migration A + seed, alone, applied to the local database, POST-CHECK green) → B1b, B2, B4, B5 in parallel."
  - Rehearsal rule: "Before the first apply, `pg_dump` the local database to the scratchpad. Every rehearsal first runs a copy of the file whose last `commit;` is replaced by `rollback;`. Only the orchestrator runs the real apply."
  - B0 also owns: the `ChannelAccess` type change (type only, fields optional until B1 fills them); `src/lib/chat/room-rules.ts` (pure: `postRefusal`, `canModerate`, `outranks`, the role lists) + test; `src/lib/chat/message-read.ts` (`MESSAGE_SELECT`, `readChatMessages(client, channelId, opts)`, `readChatMessage(client, id)`), moved out of `messages/route.ts` with no behaviour change.
  - `rooms.ts` keeps only the functions that need a database client.
  - Section 10: drop "only"; list `MessageBubble` and the thread list rows as B5's.

**H5. "New code on the old database" is one sentence, and three owned files fail unsafe when the columns are missing.**
- Evidence:
  - Section 8: `ensureMember` "selects `org_id, kind, event_id`… No behaviour change". Today it selects `org_id` only and answers 500 on any read error (`channel-access.ts:58-66`). On a database without `kind` every chat read and send fails, **DMs included**, and so do the upload, media and mention-picker routes that call it.
  - Section 8: club creation inserts `kind`, and "a failure is now FATAL: delete the club". On a database without the column every new club is created and then deleted.
  - Section 6.2: the send gate calls `can_post_org_channel`; a missing function (`PGRST202`) has no stated answer.
  - `messages/route.ts:520-528`: the existing bare retry fires on any error matching `/attachment|media|column/` and re-inserts `{ channel_id, user_id, content }`. With a missing column it would post a Board REPLY as a top-level post.
  - This is not only a local problem: section 3.10's ROLLBACK drops the columns while the new code is live.
  - Section 11 gate 6 pushes "per batch group once green" and a push to `main` is a production deploy (memory `feedback_mobile_push.md`; the repo is on `main`). Gate 5 (apply A) comes after the batches are green, so by the contract's own order new code can be live on production before the columns exist. Vercel Preview builds also run against the production database (`.env.example:134-137`).
- Change:
  - Section 3.10, replace the sentence with a table: `ensureMember` → retry with `org_id` only, `kind: null`; `canPost` → missing schema answers "allowed" (today's rule); club creation → retry with today's two rows, not fatal; thread GET and `/api/me/threads` → today's response without the new fields; card routes and B3 reads → 404; report snapshot → today's columns.
  - Section 6.2: "The bare retry never runs when `thread_root_id` was sent; that case answers 503 `try_again`."
  - Section 3.10: "Rolling back migration A needs the previous deployment restored FIRST, and migration B rolled back before A."
  - Section 11 gates: "Wave-1 commits stay on a branch. Nothing reaches `main` before migration A is applied on production and recorded. Gate 6 moves after gate 5 and says so."

---

## MEDIUM

**M1. Between "apply A" and "deploy", old code does three things 3.10 does not list.**
- Evidence:
  - Old `GET /api/me/threads` lists every channel the viewer holds a row on (`threads/route.ts:414-419`) and loads every co-member with name and avatar (`:491-498`). Event rooms get rows from `chat_channels_subscribe`, so they appear in the old inbox **with the list of people who RSVP'd**.
  - Old club creation inserts two rows (`api/orgs/route.ts:882-896`). The trigger turns them into Lounge + Board; the club has **no Officers room**, which breaks POST-CHECK's own invariant for every club created in the window.
  - Old `DELETE …/channels/[channelId]` (`:160-177`) still deletes a Board, a Lounge or an event room.
- Change, section 3.10:
  - Add the three lines, and: "The branch has a green build before A is applied; the merge to `main` follows as soon as the `schema_migrations` row is written. Target: under 15 minutes between the two."
  - "After the deploy: read-only check `clubs without exactly one board / lounge / officers` and `org channels deleted since the apply`; for any club listed, `select public.chat_repair_club(<id>)` (H1)."

**M2. A room flipped from private to public gets no rows, so the invariant in 3.4 is false for it.**
- Evidence: `channels/[channelId]/route.ts:143-151` purges rows on public → private and does nothing on private → public. `chat_channels_subscribe` is AFTER INSERT only. Section 8 allows `is_private` changes on `kind = 'room'`.
- Change, section 3.4, `chat_channels_subscribe`: "AFTER INSERT OR UPDATE OF is_private. `room` turned public → a row for every member. `room` turned private → delete the rows (the route's purge at `:143-151` is removed by B1)."

**M3. The removed-message payload does not match what the old screens already read.**
- Evidence:
  - `MessagesMobile.tsx:4439-4450` and `messages.html:1391-1404`, `:2415-2416` already draw a card from `removed_at` + `removed_reason`: "Removed by Vibe moderators", then the reason as written, then the appeal address. It is dormant only because the route does not select those columns.
  - Section 6.1 adds `removed_at` to `MESSAGE_SELECT` and pins `removed: boolean`. If the column reaches the JSON, an officer's removal shows "Removed by Vibe moderators · Reason: officer". If it does not, a platform removal is drawn "Removed by an officer" (section 10 item 3).
  - `removed_reason` is a sentence shown to the author (`src/lib/moderation/actions.ts:618`); the contract stores the tag `'officer'` in it.
  - The card is `RemovedContentCard` in `src/components/safety/ReportSheet.tsx:658`, which no batch owns.
- Change:
  - Section 6.1: replace `removed: boolean` with `removed: null | { by: "officer" | "moderator"; at: string; reason: string | null }` (own message only; `reason` is null for `by: "officer"`). `removed_at`, `removed_by`, `removed_reason` never appear in the JSON.
  - Section 6.3: officer removals store `removed_reason = OFFICER_REMOVED_REASON` (`'Removed by a club officer.'`, exported from B0's pure rules module). `by` is `"officer"` when the stored reason equals that constant, else `"moderator"`. No new column: the admin restore route already clears all three `removed_*` columns (`admin/content/restore/route.ts`), so a restored message needs no extra file.
  - Section 11: B5 owns `RemovedContentCard` (a `by` prop; officer copy has no appeal link).

**M4. The officer remove route has no "can you read this room" step, no audit row, and leaks that a report exists.**
- Evidence:
  - Section 6.3 gates: auth → rate limit → restricted → role → open report → service-role update. Today's lookup is on the cookie client (`[messageId]/route.ts:30-36`), which is what proves the caller can see the message; the contract does not say it stays.
  - A mod cannot enter the Officers room or an event room they did not RSVP to (3.5), but holds the `mod` role, so by the listed gates they can remove messages there by id, and `409 report_open` vs `200` tells them a message exists and was reported.
  - Nothing records who removed what except `removed_by` on the row, and the author can hard-delete the row (`messages_delete_own`).
- Change, section 6.3, gates in this order: "auth → rate limit → restricted → **message lookup on the cookie client, scoped to `[id]`; no row → 404** → role + rank (403) → already removed → `200 { removed: true, already: true }` → open report → 409 → update". Add: "No `moderation_actions` row is written: the admin user page counts every `message_remove` row carrying `meta.author_id` as a Vibe takedown (`src/app/api/admin/users/[id]/route.ts:121-128`). The record of an officer removal is `removed_by` + `removed_at` on the row; an author who hard-deletes the row erases it. Accepted for v1, listed in section 12."

**M5. People who RSVP are put in a room, and shown to each other, before anything tells them.**
- Evidence:
  - wave-0 call b: names are visible inside the room, and "the Going button says 'You'll appear in the event chat'". No wave-1 batch owns that line; the only RSVP call site is `src/app/campus/campus-home.tsx:9860-9865`.
  - From the moment A is applied, `chat_rsvps_room` writes the rows and 3.7 step 1 back-fills existing RSVPs (production, asis 11.6: 7 RSVPs in all, 3 events inside the window). A row holder can read the room's roster through PostgREST (`channel_members_select_member`, asis 2.4). Today names are officers-only (`rsvps_select_own_or_manager`).
- Change: section 10 (B5, same file it already owns): "Under the Going / Maybe buttons of a club event: 'You'll appear in the event chat.' Ships in the same deploy as migration A." Section 12, new open point: "Existing RSVPs join rooms without having seen that line. Default: accept (all testers); Franky says yes before the apply."

**M6. Sign-ups cannot have one slot, and a slot taken by someone who leaves can never be freed.**
- Evidence:
  - Section 4.2: "2–10 options" for both modes. The mockup Franky picked as the destination (`boards/ChatB_Room.dc.html`: "Rides from Lot 69 · 4 of 6 · Take a seat") is a sign-up with ONE slot.
  - Votes reference `users` only. After a leave, a removal or an un-RSVP the person cannot reach the card (`P0C24`), their name stays on the slot, and `count(votes) >= capacity` keeps counting them.
- Change:
  - Section 4.2: "poll: 2–10 options; sign-up: 1–10 options."
  - Section 4.1, migration B adds trigger `chat_votes_drop_access` AFTER DELETE ON `public.channel_members`: delete that person's `chat_poll_votes` for polls whose `channel_id` is the row's channel, unless they are still an owner/admin of the club (tables read directly, as in 3.4). Say in section 3 that this is the one trigger B2 may put on an existing table. Known gap, written down: the Officers room has no rows, so a demoted officer's votes there stay.

**M7. With `?after=` polling a poll never moves for anyone but the voter.**
- Evidence: section 6.1 `?after=<iso>` returns "only messages with `created_at > after`". Votes, sign-up slots, RSVP counts, reactions, `reply_count`, officer removals and deletes all change rows that are older than `after`. `messages` has no `updated_at`.
- Change, section 6.1: "`?after=` is for new messages only. Pinned for the wave-2 screens: every 5th poll, and on return from the background, the screen re-reads the last page WITHOUT `after` and replaces by id; a message missing from that page that is newer than the page's oldest row is dropped from the screen." Also: "`after` is compared with `gte` and the client drops ids it already has; the client echoes the server's `created_at` string unchanged (a JavaScript `Date` loses the microseconds and would re-fetch or skip a row)."

**M8. The pinned payloads miss fields the chosen mockups draw.**
- Evidence (mockups in `boards/`, text extracted):
  - Event room header (`ChatB_Room`): "18 going · 6 maybe · You're going" and five faces. `room.event` has no counts, no `viewer_status`, no people. wave-0 call b says they are shown inside the room.
  - wave-plan section 0: "club banner as cover". `room.org` has `logo_url` only.
  - Every author carries a hat (`ChatA_Club`: "Maya R. · President"). Section 1 makes the hat the role, but `ChatMessage` has no author role.
  - Section 5: `voters` = "the first 12", capacity goes to 50, and wave-0 call d says sign-ups show names. Names 13–50 cannot be read by any route.
- Change:
  - Section 6.1 `room.event` adds `going_count: number; maybe_count: number; viewer_status: "going" | "maybe" | null; going: Person[]` (first 8 by RSVP time, room members only).
  - `room.org` adds `banner_url: string | null`.
  - `ChatMessage` adds `author_role: "owner" | "admin" | "mod" | "member" | null` (club rooms; one `org_members` read per page, service role; null = no longer a member).
  - Section 5: `voters` = all of them for `type: "signup"`, first 12 for a poll, plus `voters_more: number`.

**M9. Two share pickers list club rooms from `/api/me/threads` and have no owner, and 6.4 changes what every old list shows.**
- Evidence:
  - Share pickers: `src/components/mobile/SharePostSheet.tsx:109`, `:525` and `public/html/_sharePicker.js:228`, `:311`. They list every thread and post into it. After the backfill a member sees every Board there; sharing into one answers 403 `board_officers_only`, which none of them knows.
  - Names: the phone list uses `t.name` (`MessagesMobile.tsx:296`), the mini messenger `t.name || peer.name` (`_miniMessenger.js:486`), the desktop inbox `thread.name` and "`members.length + 1` people" (`messages.html:2005`, `:2019`). After the rename a member of three clubs gets three rows called `lounge` and three called `board`, each "1 people" once `members` is `[]`.
  - Section 10 gives B5 only the composer in `MessagesMobile.tsx` and item 4 covers `messages.html` alone.
- Change:
  - Section 6.4: "For a club room the server sends `name` = `<club name> · <Board | Lounge | Officers | room name>`, so every old consumer shows a usable label with no code change. Club-room entries also gain `can_post: boolean` (a new top-level message)."
  - Section 6.4: keep the co-member read for calls with no param (clubs are tiny today; critique #22 is about the NEW inbox). `members: []` / `peer: null` apply to `?scope=` calls only. This removes section 10 item 4.
  - Section 11, B5 also owns `SharePostSheet.tsx` and `_sharePicker.js`: rows with `can_post === false` are left out.

**M10. The 3-room cap is built now, though the founder put it after launch.**
- Evidence: wave-0 row "3, 6, 7, 9 · After launch … up to 3 custom rooms per club … **Nothing built now**". Sections 3.4 and 8 add a raising arm to `chat_channels_fill_kind` and a 409 `room_limit`.
- Risk: a `raise` inside a BEFORE INSERT trigger on `channels` is a new way for club creation, the seed and old code to fail; a second run of `scripts/local-seed.mjs` after A would add `general` + `announcements` again as `room`s (it looks rooms up by name, `:302-321`), and one more custom room then trips the cap.
- Change: section 3.4, delete the sentence "For `kind = 'room'` … keep theirs." Section 8: keep the route's 409 `room_limit` only if Franky says yes (section 12, new point); default: leave it out.

**M11. The seed cannot be re-run after migration A without leaving junk rooms.**
- Evidence: `scripts/local-seed.mjs:302-321` finds default rooms by `name` in (`general`, `announcements`). After step 6 of 3.2 those names are gone, so every re-run inserts both again; the trigger files them as `room`. The SAE-shaped club's private `general` would be inserted public (trigger) on a database that already has A, so the pre-migration shape can only ever be seeded once.
- Change, section 8, seed bullet: "The seed detects `channels.kind`. Column present: it looks rooms up by `kind`, sends `kind` on insert, and skips the SAE pre-migration shape (prints 'already migrated'). Column absent: today's behaviour plus the SAE-shaped club. Re-running it on either database changes nothing."

**M12. New rows have no `last_read_at`, so every room starts unread and "N new" starts at 99.**
- Evidence: 3.4 writes `(channel_id, user_id, role, accepted_at)`. The old inbox marks a thread unread when `last_read_at` is null and the last message is someone else's (`threads/route.ts:639-642`); section 7 counts Lounge messages "newer than my `last_read_at`" and does not define null.
- Change: section 3.4 and 3.7: "Rows written by the backfill and by the triggers set `last_read_at = now()`." Section 7: "A null `last_read_at` is read as the row's `created_at`."

**M13. POST-CHECK "by behaviour" will pass for the wrong reason or skip on production.**
- Evidence: 3.9 probes "as a member". The INSERT policies also require `has_recorded_consent()` and `can_publish_now()` (Terms, age, verified school email, no restriction). A member who fails those is refused everywhere, so "top-level Board insert is refused" proves nothing. Production has 7 memberships in 5 clubs and SAE's Board is empty, so "skipped with a NOTICE" is the likely outcome there.
- Change, 3.9: "The probe builds its own fixtures inside the rolled-back block: it picks a club with a non-officer member who passes `can_publish_now()` (checked with that member's claims), inserts a Board post as the postgres role, then runs the four probes. The positive probes (officer top-level, member reply, member Lounge message) run FIRST. It skips only when no club has such a member, and says which condition failed."

**M14. The same thing is pinned in five shapes.**
- Evidence (sections 5, 6.1, 7):
  - An event: `EventCard.event { id, title, starts_at, ends_at, location, going_count, maybe_count }`; `room.event { id, …, location, state }`; `SpaceResponse.rooms[].event { id, …, state }` (no location); `up_next { event_id, …, room_state, going_count }`; `InboxClub.next_event { event_id, …, room_state }` (no location). Two names for the id (`id` / `event_id`) and two for the state (`state` / `room_state`).
  - A club: `{ id, handle, name, logo_url }`, then `+ verified`, then `+ banner_url, verified, member_count`.
  - The viewer: `{ role, can_post, can_reply, can_moderate }` in 6.1, `{ role, can_post_board, can_moderate }` in 7.
  - The room kind: `room.kind` in 6.1, `room_kind` in 6.4.
- Change: B0's `types.ts` defines once and every payload reuses: `OrgRef = { id, handle, name, logo_url, banner_url, verified }`; `EventRef = { id, title, starts_at, ends_at, location, state: RoomState, room_id: string | null, viewer_status, going_count, maybe_count }`; `ViewerInRoom` as in 6.1. `SpaceResponse.viewer` becomes `{ role, can_moderate }` and the Board's `can_post` is read from the Board room entry. Extra fields are added beside the ref, never by renaming.

**M15. Blocking someone changes nothing inside a club room, and v1 adds their name to polls, sign-ups and the "going" faces.**
- Evidence: `messages/route.ts:481-486` skips the block check for club rooms; the thread GET has no block filter; section 5 "voter names follow the same rule". Apple guideline 1.2 asks for a working block; the App Review pair (`scripts/seed-review-accounts.mjs`) is built so the reviewer can try Block on the other account.
- This is a product call, not a bug in the contract. Change: section 12, new open point with a default: "In club rooms a person I blocked is hidden from ME only: their messages arrive as `{ hidden: true }` stubs with no content, author or card, and they are left out of `voters` and `going`; counts are unchanged; they still see mine. Default: yes, built in the wave that ships the rooms' screens. Wave 1 only reserves `hidden: boolean` on `ChatMessage`."

---

## LOW

**L1. The order of statements inside migration A is implied, not stated.**
- Evidence: 3.2 inserts rooms (step 7) and 3.4 creates the triggers; only the section numbers say which comes first. If an implementer creates the triggers early, step 7's inserts get rows from `chat_channels_subscribe` AND from 3.7 (harmless, `on conflict do nothing`), but the counts in the header no longer match the dry run.
- Change, section 3: "Statements appear in the file in section order 3.1 → 3.9. The triggers do not exist during 3.2; the rooms made in 3.2 get their rows in 3.7."

**L2. Three pre-flight checks are missing.**
- Evidence and change, section 3.0, add:
  - "No club has two org channels with the same `name` in (`general`, `announcements`)" — there is no unique index on `(org_id, name)` (asis 1.1); two would make step 2 or 3 fail on `channels_one_core_room` mid-file. Local today: 0 (query run).
  - "A private channel picked by step 4 has no allow-list row for a non-officer" — otherwise a plain member lands in "Officers" by the `ELSE` arm of `can_view_org_channel`.
  - "SAE has at most 1 member" — wave-0 call c was decided on that fact ("the heads-up to SAE's owner only matters if real members join before the switch"). More than 1 → stop and ask.

**L3. An org channel may still have no club.**
- Evidence: scratch table with the five CHECKs and both partial indexes: `(org NULL, 'org_channel', 'board')` inserted twice, both accepted (NULLs are distinct in a unique index).
- Change, 3.3: add `constraint channels_org_channel_has_org check (type <> 'org_channel' or org_id is not null)`.

**L4. Policy text checks must compare the text Postgres prints, not the text in the contract.**
- Evidence: `pg_policies.with_check` is deparsed: `(kind = 'text'::text)`, its own parentheses, `messages.thread_root_id` qualified or not. The contract's 3.6 block is hand-written.
- Change, 3.9: "The 'intended text' constants are copied from `pg_policies` after a local apply, never typed."

**L5. The triggers must do nothing when the parent row is already gone.**
- Evidence: deleting an event cascades to `rsvps` and to the room; `chat_rsvps_room` then runs for each deleted RSVP with no event and no room left. Same for a deleted club or user.
- Change, 3.4: "Every trigger finds its club and room with a join; no row found = return, never raise."

**L6. Deleting an account now deletes other people's chat.**
- Evidence: `events_creator_id_fkey … ON DELETE CASCADE` (catalog read). An officer who created an event and deletes their account takes the event, its room and every message in it; a Board post's author takes every reply (3.1, by design).
- Change: section 12, new open point, default "accept for v1"; after launch `events.creator_id` becomes SET NULL.

**L7. Replies under a removed Board post stay readable by id.**
- Evidence: 6.1 `?root=<messageId>` lists replies; RLS hides the removed post but not its replies.
- Change, 6.1: "`?root=`: the root is read first on the cookie client; not visible, removed, or not a top-level Board post of this room → 404 `board_post_missing`."

**L8. "Read-only after 7 days" does not cover reactions or late RSVPs.**
- Evidence: `message_reactions_insert_member` checks `can_view_org_channel` only (asis 2.3); `chat_rsvps_room` has no window test.
- Change: say "accepted" in 3.4, or add the window to both.

**L9. "Officer" means two different role lists.**
- Evidence: `OFFICER_ROLES = ["owner","admin","mod"]` (`src/lib/orgs/join-state.ts:155`); `CHANNEL_ADMIN_ROLES = ["owner","admin"]` (`officer-guard.ts:26`); the contract's Board and event-room rule is owner + admin, its remove rule is owner + admin + mod, and a mod reads "Only officers post here".
- Change: B0 exports `BOARD_POSTER_ROLES` and `ROOM_MODERATOR_ROLES`; section 1 adds "chat code never imports `OFFICER_ROLES`".

**L10. Two card rules are ambiguous.**
- `PollCard.closed` = "the room no longer accepts posts": in a Board that is true for every member. Write: "past `closes_at`, or an event room past its window".
- `chat_cast_vote` lists "Lounge/rooms/event" and leaves out Officers. Write: "every kind but `board`".
- Vote route: "the message is re-read on the cookie client, scoped to `[id]`, before the RPC and before `hydrateCards`."

**L11. Things the contract adds that Franky did not decide.** Each needs a line in section 12 with a default:
- The rank rule in 6.3 (call 27 only says owners, admins and mods can remove). Default: keep.
- The 3-room cap (M10). Default: leave out.
- 3.8, the grants on `message_reactions` and `org_channel_members`: sound (no `anon` policy exists on either, catalog read), but not chat v2. Default: own small file, any day.
- Club creation deleting the club on a rooms failure (already open point 6): only safe with H5's fallback.

**L12. Things from the decisions that the contract drops or leaves unenforced.**
- The Going line (M5), photos in club rooms (H3), who's going inside the room (M8), the SAE heads-up (L2), read-only after 7 days for reactions (L8).
- Critique #20 (Requests stay), #24 (URLs for the club space and rooms; push and Otto links) and #29 (accessibility) are not mentioned anywhere. Add one line each under "Pinned here, built in wave 2" so they are not lost. 6.4: "`?scope=chats` still returns `requests`."

**L13. `InboxClub.last_activity_at` has no stated source.**
- Evidence: `orgs.last_activity_at` is bumped by every message in any room (`bump_org_activity_on_message`, asis 1.2), Officers and event rooms included, so a club row would jump to the top with nothing new to read.
- Change, section 7: "`last_activity_at` = the newest of `board.latest`, `lounge.latest` and the latest message of event rooms I hold a row on." And: "Counts read with the service role filter `removed_at is null` and `thread_root_id is null`."

**L14. `reorder` and the desktop modals are not in section 8.**
- Evidence: `channels/reorder/route.ts:78-100` writes `position` on any id of the club, event rooms included. `campus-home.tsx` `ChannelSettingsModal` (code-map: CH:3171) and `CreateChannelModal` (CH:1409) will meet 409 `room_locked` with no copy.
- Change: section 8 "reorder: ids of `kind = 'event'` → 409 `room_locked`". Section 10: "the two modals show 'This room can't be renamed, hidden or deleted.' on `room_locked`."

**L15. The flag on Vercel Preview.**
- Evidence: Preview deployments use the production database (`.env.example:134-137`); push is off there by construction, `chat_v2` has no such guard.
- Change, section 2: "`CHAT_V2_*` are set for the Production environment only."

**L16. Gate 3 cannot be measured with the seed as specified.**
- Evidence: gate 3 wants an event room with 200 messages and a member of 5 clubs; the seed bullet in section 8 creates 4 messages and nobody in 5 clubs.
- Change: gate 3 builds its rows inside `BEGIN … ROLLBACK` on the local database (`generate_series`), not in the seed.

---

## Schedule (Sept 30 – Oct 2, one reviewer)

As written, wave 1 is: two migrations (A alone has 6 columns/indexes, a 7-step backfill, 8 constraints, 5 triggers, 2 functions, 2 policy restates, 2 data steps, a behaviour probe and a rollback), 3 RPCs, about 15 route or library files, and edits in four of the largest files in the repo (`campus-home.tsx`, `MessagesMobile.tsx`, `messages.html`, `_miniMessenger.js`), then a production apply that needs a quiet hour and Franky's yes, two days before f2 (Oct 4). That does not fit.

Move out of wave 1, none of which touches the three must-haves' data model:

| item | where it goes | why it can wait |
|---|---|---|
| **B2 whole**: migration B, card routes, `hydrate`, `snapshot`, `fallback` | first batch of the Oct 5 week | cards have no screen before Oct 10–14; `messages.kind`, `card_event_id` and the `kind = 'text'` policy clause stay in A, `ChatMessage.card` is pinned and sent as `null` |
| 6.3 officer / mod remove | the wave that ships the button | needs M3 and M4 settled; no screen calls it in wave 1 |
| 6.5 mention picker for Officers | after launch | already "if time" |
| 3.8 grants | its own file | not chat |
| the room cap | out (M10) | after-launch decision |
| 6.4 `members: []` for old screens, section 10 item 4 | out (M9) | only the new inbox needs it |

What stays is still a full three days: B0 → migration A + seed (alone) → channel routes and club creation, thread GET/POST + the leave and media guards, the old-screen bars and the Going line → rehearsal → browser walk → production apply of A.

---

## Answers to the nine attack questions, in one line each

1. **SQL:** the constraints, both partial indexes, the cascade pair and the insert-policy shape hold (see Verified). Gaps: statement order (L1), three pre-flight checks (L2), org-less org channel (L3), policy text source (L4), the behaviour probe (M13).
2. **Triggers:** no ordering or "already modified" hazard found. Rows can be destroyed by existing code and by PostgREST (H1), and a private → public flip creates none (M2); triggers must tolerate missing parents (L5).
3. **Old code / new database and the reverse:** 3.10 is true as far as it goes and incomplete both ways (M1, H5).
4. **Security:** the Board rule and the card kinds cannot be bypassed by insert, update or upsert (Verified). Open: media in club rooms (H3), the remove route's missing read check (M4), replies under a removed post (L7), blocks (M15).
5. **Moderation / Apple 1.2:** report and filter are covered; remove needs M3 + M4; block is a product call (M15).
6. **File ownership:** no file has two owners. Owned by nobody and must change: `threads/[id]/members/[userId]/route.ts` (H1), `messages-upload-url/route.ts` (H3), `SharePostSheet.tsx` and `_sharePicker.js` (M9), `RemovedContentCard` in `safety/ReportSheet.tsx` (M3). Checked and need no change: `push/badge.ts`, `push/dispatch.ts`, `me/otto/route.ts`, `profile/storage-purge.ts`, `me/block/route.ts`, `safety/pair-block.ts`, `admin/reports/route.ts`, `admin/content/{remove,restore}/route.ts`, the eight `threads/[id]/*` setting routes. B0's stubs are not enough (H4).
7. **Payloads:** M8 (missing fields), M14 (five shapes), M3 (removed), M7 (freshness).
8. **Schedule:** see the section above.
9. **Dropped or added:** L11, L12.

---

## Verified (true, and the build depends on it)

- **3.3 CHECKs with NULLs.** Scratch table, 10 cases: dm with a kind, org channel without one, `org_subchannel` with one, event without `event_id`, room with `event_id`, public event room and private Board are all refused; dm with `kind` null and two `room`s in one club are accepted.
- **Both partial unique indexes** refuse a second Board in a club and allow many rooms.
- **`thread_root_id` CASCADE next to `parent_message_id` SET NULL.** Scratch table: a post with three replies (one quoting another reply, one quoting the post itself) deleted in one statement; all four rows gone, no error, an unrelated quote pair untouched. `thread_root_id is distinct from id` refuses a self-root.
- **The restated INSERT policy works through `INSERT … RETURNING` and does not recurse.** Scratch tables with RLS and a SECURITY DEFINER `can_post`, as `authenticated`: member top-level Board insert refused; member reply accepted and returned; reply to a missing root, a root sent to a Lounge, `kind = 'poll'` and a forged `removed_at` all refused; plain Lounge insert accepted. The real tables are owned by `postgres` with `relforcerowsecurity = false`, so the definer function reads `messages` outside RLS.
- **`chat_channels_fill_kind` as specified** turns old club creation (two rows, one statement) into Lounge + Board, and a row sees the rows inserted before it in the same statement.
- **A repeated RSVP re-creates a room row:** `INSERT … ON CONFLICT DO UPDATE SET status = excluded.status` with an unchanged status still fires `AFTER UPDATE OF status`.
- **Pre-flight facts (local):** both md5s match; no `chat_*` or `can_post_org_channel` function and none of the six index names exist; no deferrable FK on `channels`, `messages`, `channel_members`, `rsvps`, `events`, so the ALTER TABLEs after the backfill meet no pending trigger events; 5 clubs, 8 org channels, 6 memberships are inside the row guards.
- **Clients cannot write around the rules:** `authenticated` has no UPDATE on `messages` and no INSERT on `channel_members` or `channels` (`has_table_privilege`), so PostgREST update and merge-upsert cannot set `kind`, `thread_root_id` or a removal, and room rows are written only by the service role and the definer triggers.
- **`org_members_drop_club_access` → RSVP deletes → `chat_rsvps_room`:** all AFTER triggers; the membership row is already gone, so the "unless owner/admin" arm is false and the row delete finds 0 rows (read from the live body, asis 5; not executed).
- **Badge and Otto are untouched by the new rows:** `src/lib/push/badge.ts:100` keeps `dm` and `group` only; `src/app/api/me/otto/route.ts:426-429` reads `type = 'dm'` only.
- **3.10, old modal flipping a Board to private:** the UPDATE (`channels/[channelId]/route.ts:129`) fails on the CHECK before the row purge at `:143`. 500, nothing deleted.
- **Old subscribers do not fight the triggers:** `membership.ts:225` and `subscribe-public/route.ts:61` select `is_private = false` and upsert with `ignoreDuplicates`; private event rooms and Officers are never auto-subscribed.
- **3.8:** no policy on `message_reactions` or `org_channel_members` names `anon`.
- **Card RPCs and `p_user`:** sound as long as the refuse-inside line is the first statement; the `role` setting stays `service_role` inside a definer function, so the guarded helpers answer about `p_user` (read from the live `can_view_org_channel` body; not executed).
