# B4 review — lens: DMS, GROUPS AND SECURITY (read-only reviewer)

Reviewer notes, written as I go. Files judged: messages/route.ts, lib/chat/message-read.ts, me/threads/route.ts,
threads/[id]/members/[userId]/route.ts, threads/[id]/decline/route.ts, me/messages-upload-url/route.ts.

## Log

- start: created this file.
- read contract 0, 1, 3.4-3.10, 6.0-6.7, 11, 14, 15, 16; builder notes; git diff of the six files; channel-access.ts, rooms.ts, room-rules.ts postRefusal.
- DM c1fd3fec over HTTP (after the change): blake GET 200, DM entries of /api/me/threads identical to the builder's before-files apart from new data;
  ?limit=1, ?before (encoded) + limit=2, limit=0, limit=abc, blank before: as the old code. Unencoded "+" in ?before= 500 (old code too, not new).
  blake POST 200 (ba26a3aa "w1test B4reg DM text from blake"), avery quote 200 (parent_preview filled). Parent in another channel 400 (same sentence),
  bad key 400 "Invalid media key", bad kind 400 "Invalid media_kind", thread_root_id (uuid / object) 400 thread_root_not_allowed.
  WRITES: ba26a3aa (blake), avery's quote (DM c1fd3fec).
- DM request flow: blake created DM 34e94bd9 with casey (WRITE: channel + 2 rows). blake's first send 403 (blake has BLOCKED casey since Sept 23: the DM block
  guard, unchanged). casey decline 200 {ok:true}, again 200 {ok:true, already:true} (unchanged). blake's second send then 200 into a DM with no peer
  (9fff371e "w1test B4reg request from blake (2)") — the old route does the same (no peer = no block), not B4's change. WRITES: 34e94bd9, 9fff371e.
- DM request + implicit accept: casey created DM ed02d5ba with avery (avery pending), casey send 200; avery's list has it under requests with and
  without ?scope=chats (no org/room_kind); avery GET 200 room null; avery reply 200 -> accepted_at set, last_read_at bumped, list moves it to threads,
  casey's GET shows peer_last_read_at = avery's read. Unchanged behaviour. WRITES: channel ed02d5ba, 2 messages (w1test B4reg ...).
- Rooms the viewer cannot enter (casey: Cookout event room, Officers) answer exactly like a random uuid on GET, GET ?root, POST, POST with media
  (good and bad key), POST root=7, upload-url, decline ({ok:true, already:true}) and members DELETE. Board ?root= / thread_root_id with an Officers
  message id, a Cookout message id and a random uuid: all 404 / 409 board_post_missing. No probe found.

## Findings

### F1 (medium) — a DM (and a DM request) can drop out of the old inbox behind club-room traffic
File: src/app/api/me/threads/route.ts:639-644 (last-message read) with :735-737 (phantom-request guard) and :748-751 (unread).
Evidence: the preview read is ONE query over every listed channel, newest first, `limit(channelIds.length * 5)`. A channel whose newest message is
not in that window gets `last = null`: an accepted DM shows no preview, `unread` false, and sorts to the bottom; a pending DM request is dropped from
`requests` entirely (`if (!hasInbound) continue`). Before wave 1 most members held no club-room rows (asis 7.3 / 11.5), so their list was DMs only;
after the backfill every member lists every Board and Lounge of their clubs, and those rooms now compete for the same window.
SQL (read only, casey's list as the route builds it): 4 channels -> limit 20; the pending request from emery (88428e0f) ranks 4th, so 17 more
top-level Lounge/Board messages in casey's club hide the request from casey's old inbox. `?scope=chats` is not affected (club rooms are out).
Change: read the previews in two queries, one over the dm/group channel ids and one over the club-room ids, each ordered newest first with its own
`limit(<its ids>.length * 5)` (keep `.is("thread_root_id", null)` and the missing-schema / base-column retries on both), then merge into
`lastByChannel`. A club's traffic then can never push a DM's last message, or a request, out of the window; dm-vs-dm behaves as today.

### F2 (low) — leaving a group now also depends on a new service-role read
File: src/app/api/me/threads/[id]/members/[userId]/route.ts:75-89.
Evidence (lines read; HEAD vs now): before, a self-leave from a group read nothing with the service role and went straight to the delete; a kick
read `channels.type` and treated a failed read as "not a group" (403). Now every leave and kick reads `type, org_id` with the service role first and
answers 500 "Request failed" when that read errors, although for a dm or group the viewer's own read at :38-52 already answered `org_id` null.
Change: keep the service-role second look only where it adds something: run it when the viewer's own read at :38 returned NO row, or for a kick
(which needs `type` anyway). For a self-leave whose own read returned a row with `org_id` null, go straight to the delete as before.

## Checks run
- npm run typecheck exit 0; npx eslint on the six files exit 0; npm test 1374 pass / 0 fail.
- DM kick refusals unchanged: avery kicks blake in DM 403 "Members can only be removed from group chats"; blake kicks avery 403 "Only admins can
  remove other members"; drew 403 "Not a member". Decline of an accepted DM 409 (same sentence); drew decline {ok:true, already:true}.
- No group exists locally and no seed user has two connections, so group leave/kick were judged by reading the code (same branch as before).

## My writes (local only)
- DM c1fd3fec: ba26a3aa "w1test B4reg DM text from blake", ce7354c4 "w1test B4reg DM quote from avery".
- DM 34e94bd9 (blake -> casey, created by me; casey's row then deleted by the decline): 9fff371e "w1test B4reg request from blake (2)".
- DM ed02d5ba (casey -> avery, created by me; now accepted): "w1test B4reg request from casey", "w1test B4reg accept by reply from avery".
