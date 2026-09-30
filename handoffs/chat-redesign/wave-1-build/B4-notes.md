# B4 notes (thread routes) — running log

Batch B4 of wave 1, branch chat-v2-wave-1. Owner files: messages/route.ts, lib/chat/message-read.ts,
me/threads/route.ts, threads/[id]/members/[userId]/route.ts, threads/[id]/decline/route.ts, me/messages-upload-url/route.ts.

## Log

- start: read contract 0, 1, 3.10, 6.0-6.7, 11, 14, 15; asis 8.1, 8.2, 8.8, 8.10, 10; the route guide (params is a Promise).
- read B0 libs (types, room-rules, room-state, schema) and B1b's rooms.ts + ensureMember (uncommitted in the tree, not mine).
- baseline BEFORE any change (DM avery<->blake, c1fd3fec): blake GET 200 (2 msgs, keys ok/messages/viewer_id/peer_last_read_at/peer_typing),
  blake POST 200 "w1test B4 before-change DM from blake" (0c927158), avery GET 200 (3 msgs), avery POST with parent_message_id 200 (456494a2, parent_preview filled).
  Thread lists before: club rooms named "board"/"lounge", event rooms listed, no org/room_kind/can_post. Saved in scratchpad b4/before-*.txt.
- users.handle and users.name: both NOT NULL in the local database (name default ''), 0 null rows of 7. (contract 14.8)
- 6.4 written in me/threads/route.ts: ?scope=chats, event rooms out, label, org/room_kind/can_post, preview ignores Board replies, club room never a request.
- 6.6 leave guard, decline guard (section 15), 6.7 media guard written. HTTP: leave self 400 club_room; leave other (avery removes blake) 400 club_room;
  drew (no club) 403 Not a member; DM kick unchanged 403; decline Lounge 400 club_room; decline accepted DM unchanged 409.
  upload-url: the local stack has no R2 keys, so the route answers 503 "Media storage not configured" BEFORE auth (today's order, unchanged);
  the 403 club_media_off of 6.7 cannot be shown over HTTP here. Code path is 6 lines after ensureMember.
- message-read.ts written in 6 appends: selects (MESSAGE_SELECT + two fallbacks), cleanAfterParam, readAuthorRoles, readReplyCounts,
  toChatMessages, readChatMessages, readChatMessage, readOrgRef, readGoing, readRoomEvent, readThreadRoom, VIEWER_OUTSIDE_ROOMS.
  AttachmentRow and ParentPreview still exported under those names (14.3).

## Log, second run (the first was cut off after message-read.ts; messages/route.ts was still untouched)

- resumed: read the first run's log, the contract (0, 1, 3.10, 6.x, 11, 14, 15), rooms.ts + ensureMember as they stand, and git diff of the five files already changed.
  Kept as written: threads/route.ts (6.4), members/[userId] (6.6), decline (15), messages-upload-url (6.7). message-read.ts kept, reviewed below.
- message-read.ts, three small changes after the review: `roomOf` is exported and `ReadKnown` takes the room (the route loads the room once and reads
  the page and the room's description side by side); `readThreadRoom` asks `canPostAnswer` (orchestrator's decision), a failed gate is 503 `try_again`, not "can_post false".
- next: messages/route.ts GET (6.1), then POST (6.2).
- messages/route.ts written. GET: ?after (cleaned, 400 "Invalid after" when it is not a timestamp), ?root (limit default 200), roomOf -> 503 try_again when a
  named kind has no room, page + room description in parallel, room/viewer/viewer_id on every answer. POST: any media to a club room 400 club_media_off
  (also a bad key, asked on that path only), thread_root_id cleaned once, dm/group + root 400, canPostAnswer (failed 503, no -> postRefusal), Board ignores
  parent_message_id, insert on the cookie client, missing-schema retry keeps the whole row, no retry at all for a reply (503), 42501 logged as CONTRACT BUG,
  mentions through filterRoomReaders, answer through toChatMessages.
- typecheck green, eslint on the six files exit 0.
- DM proof AFTER the change (c1fd3fec, avery<->blake): blake GET 200, the two baseline messages identical field by field, new fields at their defaults,
  room null, viewer {role null, can_post true, can_reply false, can_moderate false}. blake POST 200 (bacf7e7e "w1test B4 after-change DM from blake"),
  avery POST with parent_message_id 200 (71133682, parent_preview filled). thread_root_id in the DM 400 thread_root_not_allowed (also as a number);
  blank thread_root_id sent as a plain message (411bfd11). Bad media key in the DM 400 "Invalid media key" (unchanged). ?after= with a bare "+" and encoded 200,
  ?after=yesterday 400, ?before+limit 200, ?root= in a DM 404 board_post_missing. drew GET 403.
  WRITES so far (local, all in the DM c1fd3fec): 0c927158, 456494a2 (first run), bacf7e7e, 71133682, 411bfd11.
- Board over HTTP (chat_seed_club, board d3c31eb8): blake top-level 403 board_officers_only; casey (mod) 403 board_officers_only; emery post 200 (ef155ab8);
  avery post 200 (2e5ebf8b, parent_message_id sent and stored null); blake reply 200 (1d1e30c0, root ef155ab8); casey reply with spaces round the id 200 (ea0f1139);
  emery reply 200 (a4cec9af, root 2e5ebf8b); root that does not exist 409 board_post_missing; root "abc" 409; reply under a reply 409; root = a Lounge message 409;
  thread_root_id as a list 400 thread_root_not_allowed.
  WRITES (local, Board): ef155ab8, 2e5ebf8b, 1d1e30c0, ea0f1139, a4cec9af.
- Board reads: default read as blake 200 = 3 top-level posts, NO replies, reply_count 0 / 2 / 1, author_role member / admin / owner, room board + org, viewer
  {member, can_post false, can_reply true, can_moderate false}; avery's viewer {owner, true, true, true}. ?root=ef155ab8 200 = the 2 replies oldest first,
  reply_count null. ?root= a reply / unknown id / a Lounge message / "abc" 404 board_post_missing; ?root= in the Lounge 404. ?after= 200 (posts from then on,
  no replies), ?after+root 200, ?after in the future 200 with no messages, limit=1 newest, after+limit=1 oldest.
- Lounge: blake send 200 (76f94df8); thread_root_id in the Lounge 400 thread_root_not_allowed (a Board post's id and a Lounge message's id);
  casey quote reply 200 (8de1e120, parent kept). WRITES (local, Lounge): 76f94df8, 8de1e120.
- Event rooms: closed room (61a0abae) blake send 403 room_closed, avery (owner) 403 room_closed, with thread_root_id 400 thread_root_not_allowed;
  read 200 with room.event state closed, viewer_status going, going_count 1, going [blake_iu], viewer.can_post false. Cookout (after): emery read 200
  (state after, can_post true), emery send 200 (2337a03c); blake (no row) GET 403, POST 403 "Not a member". Game Night (soon): casey read 200
  (viewer_status maybe, going 1, maybe 1, going [blake_iu]); blake send 200 (a4899510). WRITES (local): 2337a03c (Cookout), a4899510 (Game Night).
- Media: media_url to the Lounge 400 club_media_off (a key of the room's own shape, a bad key, a bad media_kind), the owner on the Board too.
  drew (no club, school email not verified) 403 school_email_required (requireCanPublish runs first, as today).
- Upload url: 503 "Media storage not configured" for the Lounge AND for the DM: this stack has no R2 keys and the route checks that before auth (today's order).
  The 403 club_media_off of 6.7 cannot be shown over HTTP here; to be shown on a stack that has the keys.
- Leave / decline on a club room: blake leaves the Lounge 400 club_room; avery removes blake from the Lounge 400 club_room; blake leaves the Game Night room
  400 club_room; drew 403 Not a member; decline Lounge and Board 400 club_room; decline on the accepted DM 409 (unchanged).
- "A club room is never a request": blake set his own Lounge accepted_at to null through the local data API (PATCH as blake, 200). List: the Lounge is still in
  threads, is_request false, requests 0. decline 400 club_room, leave 400 club_room, the row is still there, read 200. accepted_at put back to the value it had.
- Thread list, no param: names "Chat Seed Club · Lounge", "Chat Seed Club · Board", "SAE (local copy) · events" (a room goes by its own name); no event room for
  anyone (blake holds 3 event rows); org, room_kind, can_post on every club room; Board can_post false for blake and casey, true for emery and avery;
  the Board's preview is avery's post, not the replies sent after it. ?scope=chats: dms only (blake 1, avery 1, casey 0, emery 0, drew 0).
- Requests: emery opened a DM to casey (88428e0f, created over HTTP) and sent "w1test B4 request from emery" (7633b5f7). casey: requests 1 with no param AND
  with ?scope=chats. WRITES (local): channel 88428e0f + message 7633b5f7, left in place.
- `removed` (through the admin routes, avery is the local platform admin): blake's reply 1d1e30c0 removed with reason "w1test B4 removal check":
  blake's ?root read shows it with removed {by moderator, at, reason}; no removed_at / removed_by / removed_reason / card_event_id anywhere in the JSON;
  casey does not get the row; reply_count of the post went 2 -> 1. Removed again with the officers' exact sentence: removed {by officer, reason null}.
  avery's post 2e5ebf8b removed: ?root= 404 board_post_missing for avery (the author) and blake; a reply under it 409 board_post_missing for both;
  avery's default read still lists his own removed post with `removed`, blake's does not. Both restored (removed_at null again, checked in SQL).
  WRITES (local): 3 removes + 3 restores on two w1test messages; each wrote a moderation_actions row (that table is append-only).
- Direct calls (scratchpad b4/run-read.mjs, reads only, 34 checks, ALL PASS; output in b4/harness-out.txt): readChatMessages with nothing known (the way the
  card routes will call it), readChatMessage (own reply, a Board post with its count, not visible -> null, bad id -> null), cleanAfterParam (11 inputs), and
  THE MISSING-SCHEMA CASE of 3.10 with a client whose reads of the new columns answer 42703: Lounge 200-shape with room null and every new field at its
  default, the read runs twice (wide, then as before the migration) and never filters on thread_root_id, ?root 404, dm unchanged, any other error 500.
  The missing-schema case cannot be shown over HTTP on this stack (the local database is migrated).
- Officers room (00d7087f): blake GET 403, POST 403 "Not a member"; avery GET 200 (kind officers, viewer owner / can_post true / can_moderate true).
- Mentions, read from the notifications table after each send: avery in Officers "@blake_iu @emery_admin @casey_purdue" -> emery only; casey's Board reply
  "@blake_iu @drew_new" -> blake only; blake in Game Night "@emery_admin @casey_purdue" -> both; emery in Cookout "@blake_iu @casey_purdue @avery_owner" -> avery only.
  WRITES (local): 6c3776df (Officers), fb300b25 (Board reply), ee0002d5 (Game Night), fe63fb69 (Cookout), 5 notification rows.
- DM with a media key of the DM's own shape: 200, stored key kept, answer and read carry the proxy URL (as before). WRITE: 072131c1 (no file behind it).
- More reads: a hidden club's Lounge and SAE's Lounge as avery 200 with room + org; signed out 401 (messages, list); unknown id and malformed id 403 on
  GET / POST / leave; decline with a malformed id 500 "Request failed" (that is the committed route's answer too, not changed here).
- FINAL GATES: `npm run typecheck` exit 0; `npx eslint` on the six files exit 0; `npm test` 1374 pass, 0 fail.

## Judgement calls (none changes a name, a code or a sentence of the contract)

1. `?after=` that is not a timestamp the server could have sent: 400 `{ ok:false, error:"Invalid after" }`, no code (the contract names none). It never reaches the database.
2. `?root=` "max 200": with `root` the default limit is 200; a `limit` that is sent is clamped 1..200 as always.
3. Any media_url sent to a club room is 400 club_media_off, a key the old check would have refused too. For that the old check asks ensureMember on its
   refusal path only; a dm or a group answers exactly as before.
4. An RLS refusal after the gate said yes stays a 500 (6.2, literally) and is logged with the words CONTRACT BUG. A real race (the event's week ends, or the
   post is deleted, between the gate and the insert) therefore also answers 500 once.
5. GET: a failed `can_post_org_channel` is 503 try_again, not "can_post false" (the orchestrator's rule for the send, applied to the read too).
6. The send's answer (`message`) is a ChatMessage, the same shape the GET sends.
7. On a database without the columns a message that is not a reply is sent again WHOLE (photo, shared post and quote kept) and read back with the old select;
   without that step every DM photo would have been dropped by the old bare retry there.

## Not shown over HTTP on this stack

- upload url 403 club_media_off (no R2 keys locally; the route answers 503 before auth).
- every 503 try_again (needs a read that fails).
- the missing-schema answers of 3.10 (the local database is migrated); the read was checked with a stand-in client (run-read.mjs), the send and the list by reading the code.

## Log, repair round 1

- start: read contract 0, 3.10, 6.0-6.7, 14, 15, 16; the first run's log; 14 findings + orchestrator decisions. Disposition list goes to B4-repair.md.
- baseline BEFORE repair (DM c1fd3fec): blake GET 200, 11 msgs, room null, viewer defaults; blake POST 200 (ff9a8863 "w1test B4 repair before-change DM from blake").
  Lists saved (scratchpad b4r/before-list-*.txt): avery/blake/casey names "Chat Seed Club · Board" etc; casey requests = Emery Admin.
- plan: message-read.ts (F1-F5, F9a/b, F10-F14), messages route (RLS re-ask decision, F9b wiring), threads list (F6, F7), members (F8), upload-url (decision: club guard before R2 check).
- message-read.ts: F1 rootState yes/no/failed + lower-case compare (F14); F2 readRoles null on failure, buildChatMessages complete flag, read 503; F4/F12 reply counts (openable, exact count walk, null past cap); F5/F9a readRoomEvent one rsvps read + readGoing step-wise on viewer client; F9b viewerRole from the authors' read, describeRoom + viewerInRoom (F3 role null -> null); F10 namesARealMoment; F11 before pages backwards; F13 clamp + after check inside.
- routes: GET uses describeRoom + viewerInRoom(read.viewerRole); POST 42501 re-asks canPostAnswer (no -> postRefusal code, else 500 CONTRACT BUG); list F6 500 on orgs/roles error, F7 two preview reads; members F8 service read only for kicks or unseen channels; upload-url R2 check after the club guard.
- typecheck exit 0, eslint on the six files exit 0 (first pass).
- HTTP after repair: DM c1fd3fec as blake: 11 baseline messages byte-identical, room null, viewer defaults; POST 200 (8b67b639 "w1test B4 repair after-change DM from blake").
  Board as blake/casey/emery/avery: viewer member/mod/admin/owner, can_post false/false/true/true, rc 0/3/1/1, author_role ok. ?root 3 replies; UPPER-CASE path + ?root 200 (F14);
  root+before+limit=1 -> ea0f1139 (F11); after+before+limit=1 -> 2e5ebf8b; after bare "+" 200; after 2026-13-45T25:61 -> 400, 2026-02-30 -> 400, 2028-02-29 -> 200 (F10).
  Event rooms: casey Game Night going [blake] maybe 1 viewer_status maybe; blake closed state closed can_post false; emery Cookout counts 0. PostgREST calls per GET (Kong log):
  event room 17 -> 13, Board 10 -> 9, DM 6 (unchanged).
  Lists: casey identical to baseline; avery/blake differ only by the new DM message; no event rooms; ?scope=chats dms only; casey requests [Emery Admin] in both; casey's previews = two reads, limit 10 each (F7).
  Leave: new w1test DM 8c5c2ce3 (emery -> blake, created over HTTP): emery kick 403 (2 channels reads), emery self-leave 200 with ONE channels read (F8); Lounge leave/kick/Game Night 400 club_room; drew 403; DM kick 403; decline Lounge/Board 400, DM 409.
  Upload url: Lounge/Board 403 club_media_off (now testable locally), DM 503 storage, drew 403 school_email_required, signed out 401.
  Removed: avery removed blake's reply cd2c0a22 (reason "w1test B4 repair removal check"): blake rc=1 + ?root shows it with removed; casey rc=0, ?root empty. Restored after.
  WRITES: ff9a8863, 8b67b639 (DM), channel 8c5c2ce3 (emery left it, blake's pending row stays, no messages), 1 remove + 1 restore on cd2c0a22 (2 moderation_actions rows).
- readChatMessage: a failed loadRoom without known.access now asks ensureMember; a club room answers null (harness found it: author_role null otherwise).
- harness b4r/run-repair.mjs: 43 checks ALL PASS (after/limit/root-failure/roles-failure/viewerInRoom/event counts). First run's harness: only its 3 data checks differ (a third reply was added later), missing-schema checks pass.
- send cases re-run: blake/casey Board top-level 403 board_officers_only, missing root 409, root in Lounge 400, closed room 403, media 400 club_media_off; blake reply 200 (457e31ef, author_role member, not in the default read, rc 2).
- FINAL GATES: typecheck exit 0; eslint six files exit 0; npm test 1374 pass 0 fail. Disposition list in B4-repair.md.
