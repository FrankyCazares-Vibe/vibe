# Wave 1 integration pass: HTTP matrix (S69, Sept 29–30)

**Verdict: PASS.** Every case matches the contract (`wave-1-contracts.md` sections 6.1, 6.2, 6.4, 6.6, 6.7, 8, 15, with the orchestrator's decisions), both SQL scripts are clean, `npm run typecheck` exits 0 and `npm test` is 1,374 / 1,374.

Against the dev server at `http://localhost:3100` (hot reload, this working tree), the local database (migrated, seeded) and the seed accounts avery (owner), emery (admin), casey (mod), blake (member), drew (in no club, and his school email is not verified). No source file was changed in this step. Scripts, raw answers and the running log are in the scratchpad folder `wave1/integration/` (`notes.md`, `out-*.tsv`, `get-*.json`, `threads-*.json`).

| part | cases | result |
|---|---|---|
| 1. Event create → RSVP → cancel over the routes (15.8) | 11 steps | all as the contract says |
| 2. Refusals and allowed cases (6.2, 6.1 `root`/`after`, 6.6, 6.7, 8, 15) | 186 requests | 185 match; 1 could not be reached with the seed data (it's a rule that was there before wave 1, see "Notes") |
| 3. Thread GET, every `ThreadMessagesResponse` field and type | 27 reads (Lounge, Board, Officers, 3 event rooms, an extra room, 2 DMs; per role) | all OK |
| 3b. `GET /api/me/threads` against the database | 10 lists + 1 with a pending club row | all OK (one DM left out is today's "phantom request" rule) |
| 4. DM between two seed accounts | send, read, request, decline, leave, upload url | all OK; the upload url can't be signed locally (see "Notes") |
| 5. SQL checks | after-deploy; rooms-check | 0 findings; 200 / 200 passed, rolled back |
| 6. Gates | typecheck; npm test; eslint | exit 0; 1374 pass 0 fail; see 6 |

Short names used below: BOARD `d3c31eb8`, LOUNGE `3ea7db07`, OFFICERS `00d7087f` (chat_seed_club); GAME = "Chat Seed Game Night" room `bed10830` (upcoming, state `soon`), COOKOUT `4715d19f` (ended Sept 26, state `after`), CLOSED = "Chat Seed Closed Night" `61a0abae` (state `closed`); SAE_BOARD `777b3219`, SAE_LOUNGE `cf3f77a9`, SAE_OFFICERS `908bd027`, SAE_ROOM = sae's `events` (kind `room`) `b23ab8e2` (blake is not a member of sae, so he is the verified non-member there); DM_AB = avery–blake `c1fd3fec`; DM_BE = the new blake → emery request `f128f961`; BP = emery's Board post `ef155ab8`; REPLY = blake's reply `1d1e30c0`; SEED_POST = blake's pre-migration Board post `587408ab`; REMOVED_POST = `9f68f1a3` (made and removed for the test, then restored); RANDOM = a uuid that names nothing.

## 1. The three route cases that migration A's check could only do at SQL level (15.8)

| # | request | status / answer | checked in SQL | contract |
|---|---|---|---|---|
| 1 | avery `POST /api/events` `{org_id: chat_seed_club, title: "w1test integration event", Oct 1 18:00–20:00Z}` | 200, event `0a622d3e` | room `68e36da5`: kind `event`, `is_private` true, `event_id` set, name = title; rows for avery and emery (owner + admin), accepted; none for casey (mod) or blake | matches (room + officers' rows) |
| 2 | blake `PUT /api/events/0a622d3e/rsvp {status: going}` | 200 | rsvp `going`; blake's row on the room appears | matches |
| 3 | blake `PUT …/rsvp {status: maybe}` | 200 | rsvp `maybe`; row kept | matches |
| 4 | blake `DELETE …/rsvp` | 200 | rsvp gone; blake's row gone (avery, emery left) | matches |
| 5 | blake going again, casey maybe | 200, 200 | rows for blake and casey | matches |
| 6 | drew (not in the club) `PUT …/rsvp {status: going}` | 200 | RSVP stored, **no row** for drew | matches (gate 2: non-member RSVP writes no row) |
| 7 | blake, casey, avery `POST /api/me/threads/68e36da5/messages` | 200 ×3 | 3 messages | matches |
| 8 | drew `POST` / `GET` on the room | 403 `school_email_required` / 403 "Not a member" | nothing written | today's answers |
| 9 | blake, casey, avery, emery `GET` the room | 200 ×4, validator OK | `event.state` soon, `going_count` 2 (blake + drew), `maybe_count` 1, `going` = [blake] only (room members only), `viewer_status` going / maybe / null | matches 6.1 |
| 10 | avery `DELETE /api/events/0a622d3e` | 200 `{ok: true, notified: 3}` | events 0, channels 0, rows 0, messages 0, rsvps 0 | matches |
| 11 | the cancel notice | — | 3 `event_cancelled` notifications (blake, casey, drew) with `event_title` and `event_starts_at` | still works |

## 2. Refusals and allowed cases

Each line is one request. `got` and `contract` are `status/code` (`-` = no code in the body, `*` = any). Where a line says "today's", the answer is the one the route gave before wave 1 (a non-member or a caller who is not staff is refused before any club-room rule applies); the contract leaves those answers unchanged. Every refusal carried the exact sentence from the 6.0 table (checked: `club_media_off`, `board_officers_only`, `board_post_missing`, `thread_root_not_allowed`, `room_closed`, `club_room`, `room_locked`).

Checked in the database after the 6.2 run: no refused send wrote a row (0 messages with the refused texts); the Board post sent with `parent_message_id` was stored with it null; every reply carries `thread_root_id`; casey's Board reply naming `@blake_iu @drew_new` notified blake only (drew can't read the room), and the older Officers mention of `@blake_iu @emery_admin` notified emery only.

#### 6.2 POST /api/me/threads/[id]/messages (59/59 match)

| result | case | as | request | body | got (status/code) | contract |
|---|---|---|---|---|---|---|
| MATCH | 6.2 media Lounge (valid key) | blake | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int media","media_url":"messages/LOUNGE/w1test.jpg","media_ki…` | 400/club_media_off | 400/club_media_off |
| MATCH | 6.2 media Lounge (bad key) | blake | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int media","media_url":"x","media_kind":"image"}` | 400/club_media_off | 400/club_media_off |
| MATCH | 6.2 media Lounge mod | casey | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int media","media_url":"messages/LOUNGE/w1test.jpg","media_ki…` | 400/club_media_off | 400/club_media_off |
| MATCH | 6.2 media Board owner | avery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int media","media_url":"messages/BOARD/w1test.jpg","media_kin…` | 400/club_media_off | 400/club_media_off |
| MATCH | 6.2 media Officers admin | emery | `POST /api/me/threads/OFFICERS/messages` | `{"content":"w1test int media","media_url":"messages/OFFICERS/w1test.jpg","media_…` | 400/club_media_off | 400/club_media_off |
| MATCH | 6.2 media event room mod | casey | `POST /api/me/threads/GAME/messages` | `{"content":"","media_url":"messages/GAME/w1test.jpg","media_kind":"image"}` | 400/club_media_off | 400/club_media_off |
| MATCH | 6.2 media extra room owner | avery | `POST /api/me/threads/SAE_ROOM/messages` | `{"content":"w1test int media","media_url":"messages/SAE_ROOM/w1test.jpg","media_…` | 400/club_media_off | 400/club_media_off |
| MATCH | 6.2 media non-member (today's 403) | blake | `POST /api/me/threads/SAE_LOUNGE/messages` | `{"content":"w1test int media","media_url":"messages/SAE_LOUNGE/w1test.jpg","medi…` | 403/- | 403/- |
| MATCH | 6.2 Board post member | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int Board try by blake"}` | 403/board_officers_only | 403/board_officers_only |
| MATCH | 6.2 Board post mod | casey | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int Board try by casey"}` | 403/board_officers_only | 403/board_officers_only |
| MATCH | 6.2 Board post owner | avery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int Board post by avery"}` | 200/- | 200/- |
| MATCH | 6.2 Board post admin | emery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int Board post by emery"}` | 200/- | 200/- |
| MATCH | 6.2 Board post non-member (today's 403) | blake | `POST /api/me/threads/SAE_BOARD/messages` | `{"content":"w1test int x"}` | 403/- | 403/- |
| MATCH | 6.2 Board post owner with parent_message_id | avery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int Board post with parent","parent_message_id":"BP"}` | 200/- | 200/- |
| MATCH | 6.2 reply member | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int reply by blake","thread_root_id":"BP"}` | 200/- | 200/- |
| MATCH | 6.2 reply mod | casey | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int reply by casey @blake_iu @drew_new","thread_root_id":"BP"…` | 200/- | 200/- |
| MATCH | 6.2 reply owner | avery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int reply by avery","thread_root_id":"BP"}` | 200/- | 200/- |
| MATCH | 6.2 reply admin | emery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int reply by emery","thread_root_id":"BP"}` | 200/- | 200/- |
| MATCH | 6.2 reply to member-written post (seed) | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int reply to seed post","thread_root_id":"SEED_POST"}` | 200/- | 200/- |
| MATCH | 6.2 root not found (member) | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"RANDOM"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root not found (owner) | avery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"RANDOM"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root is a reply (member) | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"REPLY"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root is a reply (admin) | emery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"REPLY"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root in another room (Lounge msg) | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"LOUNGE_MSG"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root in another room (event msg, mod) | casey | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"GAME_MSG"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root removed (member) | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"REMOVED_POST"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root removed (author, owner) | avery | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"REMOVED_POST"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root not a uuid | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":"abc"}` | 409/board_post_missing | 409/board_post_missing |
| MATCH | 6.2 root a number (16.3) | blake | `POST /api/me/threads/BOARD/messages` | `{"content":"w1test int x","thread_root_id":5}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 root in Lounge member | blake | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int x","thread_root_id":"BP"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 root in Lounge owner | avery | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int x","thread_root_id":"BP"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 root in Lounge (own lounge msg) | blake | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int x","thread_root_id":"LOUNGE_MSG"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 root in Officers admin | emery | `POST /api/me/threads/OFFICERS/messages` | `{"content":"w1test int x","thread_root_id":"BP"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 root in event room mod | casey | `POST /api/me/threads/GAME/messages` | `{"content":"w1test int x","thread_root_id":"GAME_MSG"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 root in extra room owner | avery | `POST /api/me/threads/SAE_ROOM/messages` | `{"content":"w1test int x","thread_root_id":"BP"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 root in dm | blake | `POST /api/me/threads/DM_AB/messages` | `{"content":"w1test int x","thread_root_id":"BP"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 root in dm (random) | avery | `POST /api/me/threads/DM_AB/messages` | `{"content":"w1test int x","thread_root_id":"RANDOM"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 closed event member | blake | `POST /api/me/threads/CLOSED/messages` | `{"content":"w1test int x"}` | 403/room_closed | 403/room_closed |
| MATCH | 6.2 closed event owner | avery | `POST /api/me/threads/CLOSED/messages` | `{"content":"w1test int x"}` | 403/room_closed | 403/room_closed |
| MATCH | 6.2 closed event admin | emery | `POST /api/me/threads/CLOSED/messages` | `{"content":"w1test int x"}` | 403/room_closed | 403/room_closed |
| MATCH | 6.2 closed event mod (no row, today's 403) | casey | `POST /api/me/threads/CLOSED/messages` | `{"content":"w1test int x"}` | 403/- | 403/- |
| MATCH | 6.2 closed event with root | blake | `POST /api/me/threads/CLOSED/messages` | `{"content":"w1test int x","thread_root_id":"BP"}` | 400/thread_root_not_allowed | 400/thread_root_not_allowed |
| MATCH | 6.2 Lounge member | blake | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int Lounge by blake"}` | 200/- | 200/- |
| MATCH | 6.2 Lounge mod | casey | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int Lounge by casey"}` | 200/- | 200/- |
| MATCH | 6.2 Lounge admin | emery | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int Lounge by emery"}` | 200/- | 200/- |
| MATCH | 6.2 Lounge owner quote | avery | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int Lounge quote by avery","parent_message_id":"LOUNGE_MSG"}` | 200/- | 200/- |
| MATCH | 6.2 Officers owner | avery | `POST /api/me/threads/OFFICERS/messages` | `{"content":"w1test int Officers by avery"}` | 200/- | 200/- |
| MATCH | 6.2 Officers admin | emery | `POST /api/me/threads/OFFICERS/messages` | `{"content":"w1test int Officers by emery"}` | 200/- | 200/- |
| MATCH | 6.2 Officers mod (no access, today's 403) | casey | `POST /api/me/threads/OFFICERS/messages` | `{"content":"w1test int x"}` | 403/- | 403/- |
| MATCH | 6.2 Officers member (no access) | blake | `POST /api/me/threads/OFFICERS/messages` | `{"content":"w1test int x"}` | 403/- | 403/- |
| MATCH | 6.2 event soon member | blake | `POST /api/me/threads/GAME/messages` | `{"content":"w1test int Game Night by blake"}` | 200/- | 200/- |
| MATCH | 6.2 event soon mod (maybe) | casey | `POST /api/me/threads/GAME/messages` | `{"content":"w1test int Game Night by casey"}` | 200/- | 200/- |
| MATCH | 6.2 event after-window owner | avery | `POST /api/me/threads/COOKOUT/messages` | `{"content":"w1test int Cookout by avery"}` | 200/- | 200/- |
| MATCH | 6.2 event after-window member no RSVP | blake | `POST /api/me/threads/COOKOUT/messages` | `{"content":"w1test int x"}` | 403/- | 403/- |
| MATCH | 6.2 extra room owner | avery | `POST /api/me/threads/SAE_ROOM/messages` | `{"content":"w1test int SAE events room by avery"}` | 200/- | 200/- |
| MATCH | 6.2 non-member Lounge | blake | `POST /api/me/threads/SAE_LOUNGE/messages` | `{"content":"w1test int x"}` | 403/- | 403/- |
| MATCH | 6.2 unverified non-member (publish gate) | drew | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int x"}` | 403/school_email_required | 403/school_email_required |
| MATCH | 6.2 dm send | blake | `POST /api/me/threads/DM_AB/messages` | `{"content":"w1test int DM from blake"}` | 200/- | 200/- |
| MATCH | 6.2 signed out | anon | `POST /api/me/threads/LOUNGE/messages` | `{"content":"w1test int x"}` | 401/- | 401/- |

#### 6.1 GET ?root / ?after refusals (10/10 match)

| result | case | as | request | body | got (status/code) | contract |
|---|---|---|---|---|---|---|
| MATCH | 6.1 ?root removed post (author) | avery | `GET /api/me/threads/BOARD/messages?root=REMOVED_POST` |  | 404/board_post_missing | 404/board_post_missing |
| MATCH | 6.1 ?root removed post (member) | blake | `GET /api/me/threads/BOARD/messages?root=REMOVED_POST` |  | 404/board_post_missing | 404/board_post_missing |
| MATCH | 6.1 ?root is a reply | blake | `GET /api/me/threads/BOARD/messages?root=REPLY` |  | 404/board_post_missing | 404/board_post_missing |
| MATCH | 6.1 ?root not found | casey | `GET /api/me/threads/BOARD/messages?root=RANDOM` |  | 404/board_post_missing | 404/board_post_missing |
| MATCH | 6.1 ?root other room's message | blake | `GET /api/me/threads/BOARD/messages?root=LOUNGE_MSG` |  | 404/board_post_missing | 404/board_post_missing |
| MATCH | 6.1 ?root on the Lounge | blake | `GET /api/me/threads/LOUNGE/messages?root=LOUNGE_MSG` |  | 404/board_post_missing | 404/board_post_missing |
| MATCH | 6.1 ?root not a uuid | blake | `GET /api/me/threads/BOARD/messages?root=abc` |  | 404/board_post_missing | 404/board_post_missing |
| MATCH | 6.1 ?after garbage (decision: 400 no code) | blake | `GET /api/me/threads/LOUNGE/messages?after=garbage` |  | 400/- | 400/- |
| MATCH | 6.1 non-member GET | drew | `GET /api/me/threads/LOUNGE/messages` |  | 403/- | 403/- |
| MATCH | 6.1 signed out GET | anon | `GET /api/me/threads/LOUNGE/messages` |  | 401/- | 401/- |

#### 6.6 leave guard + section 15 decline + DM leave (23/23 match)

| result | case | as | request | body | got (status/code) | contract |
|---|---|---|---|---|---|---|
| MATCH | 6.6 self-leave Lounge member | blake | `DELETE /api/me/threads/LOUNGE/members/blake` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave Board member | blake | `DELETE /api/me/threads/BOARD/members/blake` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave event room member | blake | `DELETE /api/me/threads/GAME/members/blake` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave closed event member | blake | `DELETE /api/me/threads/CLOSED/members/blake` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave Lounge mod | casey | `DELETE /api/me/threads/LOUNGE/members/casey` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave Lounge admin | emery | `DELETE /api/me/threads/LOUNGE/members/emery` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave Lounge owner | avery | `DELETE /api/me/threads/LOUNGE/members/avery` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave Officers owner (no row) | avery | `DELETE /api/me/threads/OFFICERS/members/avery` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave extra room owner | avery | `DELETE /api/me/threads/SAE_ROOM/members/avery` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 self-leave event after-window admin | emery | `DELETE /api/me/threads/COOKOUT/members/emery` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 kick member from Lounge (admin) | emery | `DELETE /api/me/threads/LOUNGE/members/blake` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 kick member from Board (owner) | avery | `DELETE /api/me/threads/BOARD/members/blake` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 kick member from event room (owner) | avery | `DELETE /api/me/threads/GAME/members/blake` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 kick owner from Lounge (member) | blake | `DELETE /api/me/threads/LOUNGE/members/avery` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 kick admin from Lounge (mod) | casey | `DELETE /api/me/threads/LOUNGE/members/emery` |  | 400/club_room | 400/club_room |
| MATCH | 6.6 Officers mod (cannot see, today's 403) | casey | `DELETE /api/me/threads/OFFICERS/members/casey` |  | 403/- | 403/- |
| MATCH | 6.6 non-member on Lounge (today's 403) | drew | `DELETE /api/me/threads/LOUNGE/members/drew` |  | 403/- | 403/- |
| MATCH | 6.6 non-member on SAE Lounge (today's 403) | blake | `DELETE /api/me/threads/SAE_LOUNGE/members/blake` |  | 403/- | 403/- |
| MATCH | 6.6 signed out | anon | `DELETE /api/me/threads/LOUNGE/members/blake` |  | 401/- | 401/- |
| MATCH | 6.6 dm kick by non-admin (unchanged) | emery | `DELETE /api/me/threads/DM_BE/members/blake` |  | 403/- | 403/- |
| MATCH | 6.6 dm kick by admin (unchanged: groups only) | blake | `DELETE /api/me/threads/DM_BE/members/emery` |  | 403/- | 403/- |
| MATCH | 15 decline dm request (unchanged) | emery | `POST /api/me/threads/DM_BE/decline` |  | 200/- | 200/- |
| MATCH | 6.6 self-leave dm (unchanged) | blake | `DELETE /api/me/threads/DM_BE/members/blake` |  | 200/- | 200/- |

#### 6.7 upload url (16/16 match)

| result | case | as | request | body | got (status/code) | contract |
|---|---|---|---|---|---|---|
| MATCH | 6.7 Lounge member | blake | `POST /api/me/messages-upload-url` | `{"channelId":"LOUNGE","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 Lounge mod | casey | `POST /api/me/messages-upload-url` | `{"channelId":"LOUNGE","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 Lounge admin | emery | `POST /api/me/messages-upload-url` | `{"channelId":"LOUNGE","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 Lounge owner | avery | `POST /api/me/messages-upload-url` | `{"channelId":"LOUNGE","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 Board member | blake | `POST /api/me/messages-upload-url` | `{"channelId":"BOARD","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 Board owner | avery | `POST /api/me/messages-upload-url` | `{"channelId":"BOARD","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 Officers admin | emery | `POST /api/me/messages-upload-url` | `{"channelId":"OFFICERS","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 event room member | blake | `POST /api/me/messages-upload-url` | `{"channelId":"GAME","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 closed event owner | avery | `POST /api/me/messages-upload-url` | `{"channelId":"CLOSED","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 after-window event admin | emery | `POST /api/me/messages-upload-url` | `{"channelId":"COOKOUT","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 extra room owner | avery | `POST /api/me/messages-upload-url` | `{"channelId":"SAE_ROOM","contentType":"image/jpeg","sizeBytes":1000}` | 403/club_media_off | 403/club_media_off |
| MATCH | 6.7 Officers mod (no access, today's 403) | casey | `POST /api/me/messages-upload-url` | `{"channelId":"OFFICERS","contentType":"image/jpeg","sizeBytes":1000}` | 403/- | 403/- |
| MATCH | 6.7 non-member (today's 403) | blake | `POST /api/me/messages-upload-url` | `{"channelId":"SAE_LOUNGE","contentType":"image/jpeg","sizeBytes":1000}` | 403/- | 403/- |
| MATCH | 6.7 dm (passes guard; local has no R2 = today's 503) | blake | `POST /api/me/messages-upload-url` | `{"channelId":"DM_AB","contentType":"image/jpeg","sizeBytes":1000}` | 503/- | 503/- |
| MATCH | 6.7 dm other side | avery | `POST /api/me/messages-upload-url` | `{"channelId":"DM_AB","contentType":"image/jpeg","sizeBytes":1000}` | 503/- | 503/- |
| MATCH | 6.7 signed out | anon | `POST /api/me/messages-upload-url` | `{"channelId":"LOUNGE","contentType":"image/jpeg","sizeBytes":1000}` | 401/- | 401/- |

#### 8 channel list and create (17/18 match)

| result | case | as | request | body | got (status/code) | contract |
|---|---|---|---|---|---|---|
| MATCH | 8 GET list owner | avery | `GET /api/orgs/chat_seed_club/channels` |  | 200/- | 200/* |
| MATCH | 8 GET list admin | emery | `GET /api/orgs/chat_seed_club/channels` |  | 200/- | 200/* |
| MATCH | 8 GET list mod | casey | `GET /api/orgs/chat_seed_club/channels` |  | 200/- | 200/* |
| MATCH | 8 GET list member | blake | `GET /api/orgs/chat_seed_club/channels` |  | 200/- | 200/* |
| MATCH | 8 GET list non-member | drew | `GET /api/orgs/chat_seed_club/channels` |  | 403/members_only | 403/members_only |
| MATCH | 8 GET list non-member of sae | blake | `GET /api/orgs/sae/channels` |  | 403/members_only | 403/members_only |
| MATCH | 8 GET list hidden club stranger | blake | `GET /api/orgs/test_hidden_club/channels` |  | 404/not_found | 404/not_found |
| MATCH | 8 GET list signed out | anon | `GET /api/orgs/chat_seed_club/channels` |  | 401/unauthorized | 401/unauthorized |
| MATCH | 8 POST name Board (owner) | avery | `POST /api/orgs/chat_seed_club/channels` | `{"name":"Board"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 POST name LOUNGE (admin) | emery | `POST /api/orgs/chat_seed_club/channels` | `{"name":"LOUNGE"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 POST name officers (admin) | emery | `POST /api/orgs/chat_seed_club/channels` | `{"name":"officers","is_private":true}` | 409/room_locked | 409/room_locked |
| MATCH | 8 POST name " Officers " (owner) | avery | `POST /api/orgs/chat_seed_club/channels` | `{"name":" Officers "}` | 409/room_locked | 409/room_locked |
| MATCH | 8 POST mod (today's 403) | casey | `POST /api/orgs/chat_seed_club/channels` | `{"name":"w1test-int-x"}` | 403/- | 403/- |
| MATCH | 8 POST member (today's 403) | blake | `POST /api/orgs/chat_seed_club/channels` | `{"name":"w1test-int-x"}` | 403/- | 403/- |
| MATCH | 8 POST non-member (today's 403) [expectation corrected: publish gate runs first, as at HEAD] | drew | `POST /api/orgs/chat_seed_club/channels` | `{"name":"w1test-int-x"}` | 403/school_email_required | 403/school_email_required |
| MATCH | 8 POST reserved name as mod | casey | `POST /api/orgs/chat_seed_club/channels` | `{"name":"board"}` | 403/- | 403/- |
| N/A | 8 POST name = an event room's title (accepted: clash kept) [seed titles have spaces: HEAD name rule 400 answers first; clash covered by B1b w1test-dup] | avery | `POST /api/orgs/chat_seed_club/channels` | `{"name":"Chat Seed Game Night"}` | 400/- | 400/- |
| MATCH | 8 POST new room (owner) | avery | `POST /api/orgs/chat_seed_club/channels` | `{"name":"w1test-int-room"}` | 201/- | 201/- |

#### 8 channel PATCH (part 1) (28/28 match)

| result | case | as | request | body | got (status/code) | contract |
|---|---|---|---|---|---|---|
| MATCH | 8 PATCH Board rename (owner) | avery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"name":"w1test-board"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH Board private (admin) | emery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"is_private":true}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH Board rename + topic (nothing written) | avery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"name":"w1test-board","topic":"w1test topic x"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH Board private + topic (nothing written) | emery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"is_private":true,"topic":"w1test topic x"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH Lounge rename (owner) | avery | `PATCH /api/orgs/chat_seed_club/channels/LOUNGE` | `{"name":"w1test-lounge"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH Lounge private (admin) | emery | `PATCH /api/orgs/chat_seed_club/channels/LOUNGE` | `{"is_private":true}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH Officers rename (owner) | avery | `PATCH /api/orgs/chat_seed_club/channels/OFFICERS` | `{"name":"w1test-off"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH Officers public (admin) | emery | `PATCH /api/orgs/chat_seed_club/channels/OFFICERS` | `{"is_private":false}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH Board topic (owner) | avery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"topic":"w1test int topic"}` | 200/- | 200/- |
| MATCH | 8 PATCH Board topic back (admin) | emery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"topic":""}` | 200/- | 200/- |
| MATCH | 8 PATCH Board settings body, equal name+private (decision) | avery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"name":"BOARD","is_private":false,"topic":"w1test int topic2"}` | 200/- | 200/- |
| MATCH | 8 PATCH Board topic back 2 | avery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"topic":""}` | 200/- | 200/- |
| MATCH | 8 PATCH Board position same | avery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"position":1}` | 200/- | 200/- |
| MATCH | 8 PATCH Board pinned false | emery | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"pinned":false}` | 200/- | 200/- |
| MATCH | 8 PATCH Lounge topic (admin) | emery | `PATCH /api/orgs/chat_seed_club/channels/LOUNGE` | `{"topic":"w1test int topic"}` | 200/- | 200/- |
| MATCH | 8 PATCH Lounge topic back | emery | `PATCH /api/orgs/chat_seed_club/channels/LOUNGE` | `{"topic":""}` | 200/- | 200/- |
| MATCH | 8 PATCH Officers topic (owner) | avery | `PATCH /api/orgs/chat_seed_club/channels/OFFICERS` | `{"topic":"w1test int topic"}` | 200/- | 200/- |
| MATCH | 8 PATCH Officers topic back | avery | `PATCH /api/orgs/chat_seed_club/channels/OFFICERS` | `{"topic":""}` | 200/- | 200/- |
| MATCH | 8 PATCH event topic (owner) | avery | `PATCH /api/orgs/chat_seed_club/channels/GAME` | `{"topic":"w1test"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH event pinned (admin) | emery | `PATCH /api/orgs/chat_seed_club/channels/GAME` | `{"pinned":true}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH event position (owner) | avery | `PATCH /api/orgs/chat_seed_club/channels/COOKOUT` | `{"position":5}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH event empty body (owner) | avery | `PATCH /api/orgs/chat_seed_club/channels/CLOSED` | `{}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH event rename (admin) | emery | `PATCH /api/orgs/chat_seed_club/channels/GAME` | `{"name":"w1test-game"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH room rename to Officers | avery | `PATCH /api/orgs/chat_seed_club/channels/ROOM` | `{"name":"Officers"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH room rename to " board " | emery | `PATCH /api/orgs/chat_seed_club/channels/ROOM` | `{"name":" board "}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH room rename to lounge | avery | `PATCH /api/orgs/chat_seed_club/channels/ROOM` | `{"name":"lounge"}` | 409/room_locked | 409/room_locked |
| MATCH | 8 PATCH room rename ok | avery | `PATCH /api/orgs/chat_seed_club/channels/ROOM` | `{"name":"w1test-int-room2"}` | 200/- | 200/- |
| MATCH | 8 PATCH room private | emery | `PATCH /api/orgs/chat_seed_club/channels/ROOM` | `{"is_private":true}` | 200/- | 200/- |

#### 8 channel PATCH (part 2), DELETE, reorder (28/28 match)

| result | case | as | request | body | got (status/code) | contract |
|---|---|---|---|---|---|---|
| MATCH | 8 PATCH room public again | avery | `PATCH /api/orgs/chat_seed_club/channels/ROOM` | `{"is_private":false}` | 200/- | 200/- |
| MATCH | 8 PATCH Board topic as mod (today's 403) | casey | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"topic":"w1test"}` | 403/- | 403/- |
| MATCH | 8 PATCH Board rename as member (today's 403) | blake | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"name":"w1test"}` | 403/- | 403/- |
| MATCH | 8 PATCH event as mod (today's 403) | casey | `PATCH /api/orgs/chat_seed_club/channels/GAME` | `{"topic":"w1test"}` | 403/- | 403/- |
| MATCH | 8 PATCH non-member (publish gate at HEAD?) | drew | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"topic":"w1test"}` | 403/- | 403/* |
| MATCH | 8 PATCH unknown id | avery | `PATCH /api/orgs/chat_seed_club/channels/RANDOM` | `{"topic":"w1test"}` | 404/- | 404/- |
| MATCH | 8 PATCH other club's room | avery | `PATCH /api/orgs/chat_seed_club/channels/SAE_BOARD` | `{"topic":"w1test"}` | 404/- | 404/- |
| MATCH | 8 PATCH signed out | anon | `PATCH /api/orgs/chat_seed_club/channels/BOARD` | `{"topic":"w1test"}` | 401/- | 401/- |
| MATCH | 8 DELETE Board owner | avery | `DELETE /api/orgs/chat_seed_club/channels/BOARD` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE Board admin | emery | `DELETE /api/orgs/chat_seed_club/channels/BOARD` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE Lounge owner | avery | `DELETE /api/orgs/chat_seed_club/channels/LOUNGE` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE Lounge admin | emery | `DELETE /api/orgs/chat_seed_club/channels/LOUNGE` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE Officers owner | avery | `DELETE /api/orgs/chat_seed_club/channels/OFFICERS` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE Officers admin | emery | `DELETE /api/orgs/chat_seed_club/channels/OFFICERS` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE event soon owner | avery | `DELETE /api/orgs/chat_seed_club/channels/GAME` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE event closed admin | emery | `DELETE /api/orgs/chat_seed_club/channels/CLOSED` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE event after owner | avery | `DELETE /api/orgs/chat_seed_club/channels/COOKOUT` |  | 409/room_locked | 409/room_locked |
| MATCH | 8 DELETE Board mod (today's 403) | casey | `DELETE /api/orgs/chat_seed_club/channels/BOARD` |  | 403/- | 403/- |
| MATCH | 8 DELETE room mod (today's 403) | casey | `DELETE /api/orgs/chat_seed_club/channels/ROOM` |  | 403/- | 403/- |
| MATCH | 8 DELETE room member (today's 403) | blake | `DELETE /api/orgs/chat_seed_club/channels/ROOM` |  | 403/- | 403/- |
| MATCH | 8 DELETE room non-member | drew | `DELETE /api/orgs/chat_seed_club/channels/ROOM` |  | 403/- | 403/* |
| MATCH | 8 DELETE unknown id | avery | `DELETE /api/orgs/chat_seed_club/channels/RANDOM` |  | 404/- | 404/- |
| MATCH | 8 reorder with an event id (owner) | avery | `POST /api/orgs/chat_seed_club/channels/reorder` | `{"channel_ids":["LOUNGE","BOARD","GAME"]}` | 409/room_locked | 409/room_locked |
| MATCH | 8 reorder with an event id (admin) | emery | `POST /api/orgs/chat_seed_club/channels/reorder` | `{"channel_ids":["CLOSED"]}` | 409/room_locked | 409/room_locked |
| MATCH | 8 reorder without event (same order) | avery | `POST /api/orgs/chat_seed_club/channels/reorder` | `{"channel_ids":["LOUNGE","BOARD","OFFICERS"]}` | 200/- | 200/- |
| MATCH | 8 reorder as mod (today's 403) | casey | `POST /api/orgs/chat_seed_club/channels/reorder` | `{"channel_ids":["LOUNGE","BOARD"]}` | 403/- | 403/- |
| MATCH | 8 reorder as member (today's 403) | blake | `POST /api/orgs/chat_seed_club/channels/reorder` | `{"channel_ids":["LOUNGE","BOARD"]}` | 403/- | 403/- |
| MATCH | 8 DELETE room admin | emery | `DELETE /api/orgs/chat_seed_club/channels/ROOM` |  | 200/- | 200/- |

#### 8 club creation (4/4 match)

| result | case | as | request | body | got (status/code) | contract |
|---|---|---|---|---|---|---|
| MATCH | 8 club create: list as owner | emery | `GET /api/orgs/w1test_int_club/channels` |  | 200/- | 200/* |
| MATCH | 8 club create: list as non-member | blake | `GET /api/orgs/w1test_int_club/channels` |  | 403/members_only | 403/members_only |
| MATCH | 8 club create: same handle again | emery | `POST /api/orgs` | `{"handle":"w1test_int_club","name":"w1test int club again"}` | 409/handle_taken | 409/handle_taken |
| MATCH | 8 club create: signed out | anon | `POST /api/orgs` | `{"handle":"w1test_int_club9","name":"w1test"}` | 401/unauthorized | 401/unauthorized |

Also checked on the side:
- The pending club row (section 15): blake set his own Lounge `accepted_at` to null through PostgREST (allowed, as 15 says). `GET /api/me/threads` still listed the Lounge as a thread (`is_request` false, not in `requests`), with and without `?scope=chats` (where club rooms are left out anyway). `POST …/decline` on Lounge, Board and GAME answered 400 `club_room` for blake, and on the Lounge for casey, emery and avery; blake's rows were all still there. Then `accepted_at` was put back to its first value (`2026-09-29 20:41:06.394978+00`, checked).
- PATCH on a Board, Lounge or Officers room with a real change as well as an allowed field (`{name, topic}`, `{is_private, topic, pinned}`) answered 409 and nothing was written (name, privacy, topic and pinned unchanged, checked in SQL right after).
- The channel snapshot of chat_seed_club (names, kinds, privacy, positions, pinned, topics null) is identical before and after section 8; 17 room rows before and after.
- `w1test-int-room` (created as avery, 201, stored kind `room`, public, position 100, 4 member rows from the trigger) → rename to Officers / " board " / lounge 409 → rename 200 → private 200 (rows 4 → 0, the database's purge) → public 200 → emery DELETE 200.
- `POST /api/orgs` as emery, `w1test_int_club` (201): Lounge (0, public), Board (1, public), Officers (2, private), all `org_channel`; emery's rows on Lounge and Board, accepted and read; none on Officers (by design, 3.4). Its list shows three rooms with `kind`; blake 403 `members_only`; emery's inbox lists "w1test int club · Lounge" / "· Board".
- Officer-style removal (REMOVED_POST removed with the reason `Removed by a club officer.` through the admin route): avery (the author) sees `removed: {by: "officer", at, reason: null}`, blake does not see the row, no `removed_*` key in the JSON. The moderator-style removal (reason "w1test int removal") read `{by: "moderator", reason: "w1test int removal"}`. Restored both times (checked `removed_at` null).

## 3. Thread GET: every field of `ThreadMessagesResponse` (6.0, 6.1)

A validator (`validate.mjs`) checked each answer field by field: `ok`; `messages[]` with today's `id, content, created_at, user_id` plus `kind` (text/poll/event_card), `thread_root_id`, `card` null, `reply_count` (an integer on a Board top-level post, null everywhere else and on replies), `author_role` (a club role or null; null in a dm), `hidden` false, `removed` null or `{by, at, reason}`, and no `removed_at` / `removed_by` / `removed_reason`; `viewer_id`; `peer_last_read_at` (null in club rooms); `peer_typing` ([] in club rooms); `room` (null in a dm; else `id, kind, name, org` as a full OrgRef, `event` null except in an event room, where it is a full EventRef plus `going` ≤ 8 Persons); `viewer` (`role`, `can_post`, `can_reply` = true only in a Board, `can_moderate` = owner/admin/mod). No reply is listed as a post without `?root`.

| room | as | status | viewer (`role` / `can_post` / `can_reply` / `can_moderate`) | notes |
|---|---|---|---|---|
| Board | avery / emery / casey / blake | 200 ×4, OK | owner t/t/t · admin t/t/t · mod **f**/t/t · member **f**/t/f | 8 posts for avery (his own removed post with `removed`), 7 for the others; `reply_count` equals the database's count per post (1, 7, 1, 2, 0…) |
| Board | drew | 403 "Not a member" | — | today's |
| Lounge | avery / emery / casey / blake | 200 ×4, OK | all `can_post` true, `can_reply` false; `can_moderate` t/t/t/f | `author_role` owner/admin/mod/member on the rows |
| Lounge | drew | 403 | — | today's |
| Officers | avery / emery | 200 ×2, OK | owner / admin, `can_post` true | |
| Officers | casey / blake | 403 | — | Officers is owner/admin only |
| GAME (`soon`) | avery / emery / casey / blake | 200 ×4, OK | `can_post` true for all | `going_count` 1, `maybe_count` 1, `going` [blake], `viewer_status` null / null / maybe / going, `room_id` set |
| GAME | drew | 403 | — | |
| COOKOUT (`after`) | avery / emery | 200 ×2, OK | `can_post` true | counts 0, `going` [] |
| COOKOUT | casey / blake | 403 | — | no RSVP, no row |
| CLOSED (`closed`) | avery / emery / blake | 200 ×3, OK | `can_post` **false** for all | blake `viewer_status` going |
| SAE_ROOM (kind `room`) | avery / blake | 200 OK / 403 | owner t/f/t | |
| SAE_OFFICERS | avery | 200, OK | owner | |
| DM_AB | avery / blake | 200 ×2, OK | `role` null, `can_post` true, `can_reply` false, `can_moderate` false; `room` null | 14 messages, all new fields at their defaults |
| avery–casey DM | casey / blake | 200 OK / 403 | as above | |

`?root`, `?after`, `before`, `limit`:
- `?root=BP` as blake, casey, avery: 200, OK, 7 replies, oldest first, every `thread_root_id` = BP, `reply_count` null on each.
- `?root` = the removed post (author and member), a reply, RANDOM, a Lounge message, a message of the Lounge read on the Lounge, `abc`: 404 `board_post_missing` (rows in the 6.1 table above).
- `?after=<the created_at string the server sent>` on the Lounge: 200, OK, 4 messages, the first equal to `after`, all `>= after`, the same count as the database. `?after=garbage`: 400 "Invalid after" with no code (orchestrator decision).
- `?before=<created_at>&limit=2`: the 2 newest before that moment, oldest first (unchanged). Board `?limit=2`: 2 top-level posts.

### 3b. `GET /api/me/threads` (6.4, 15)

`validate-threads.mjs` compared each list with the database, for every row the viewer holds. For avery (21 threads), emery (7, then 9 after the new club), casey (3 + 1 request), blake (6) and drew (0), with and without `?scope=chats`:
- event rooms are never listed (blake holds rows on GAME and CLOSED, avery and emery on all three);
- every club room's `name` is `<club name> · Board | Lounge | <room name>` ("Chat Seed Club · Board", "SAE (local copy) · events");
- every club room has `org` (a full OrgRef), `room_kind` and `can_post` (Board: true only for owner/admin; else true); DMs carry none of them;
- the preview is the newest top-level message: after the replies of the 6.2 run the Board's newest row is a reply, and the list shows "w1test int Board post with parent";
- `?scope=chats` lists DMs and groups only and still has `requests` (casey's pending DM from emery; emery's pending DM from blake);
- a club row with `accepted_at` null is a thread, never a request (above).
- The one row a list leaves out is blake's DM `8c5c2ce3` (only blake in it, pending, no message): the "phantom request" rule the route had before wave 1 (`threads/route.ts` about line 740). Expected.

## 4. A DM between two seed accounts

| step | request | answer |
|---|---|---|
| send | blake `POST /api/me/threads/DM_AB/messages {"content":"w1test int DM from blake"}` | 200 |
| read | avery and blake `GET /api/me/threads/DM_AB/messages` | 200, validator OK (all new fields at their defaults) |
| a root in a DM | blake / avery with `thread_root_id` | 400 `thread_root_not_allowed` |
| new request | blake `POST /api/me/threads {"handle":"emery_admin"}` → `f128f961`, then a message | 200 `{created: true}`, 200; emery's list shows it under `requests` (`is_request` true), with and without `?scope=chats`; emery can read it (200, OK) |
| kick in a DM | emery (not admin) / blake (admin) `DELETE …/DM_BE/members/<other>` | 403 "Only admins can remove other members" / 403 "Members can only be removed from group chats" (unchanged) |
| decline | emery `POST …/DM_BE/decline` | 200; emery's row gone |
| leave | blake `DELETE …/DM_BE/members/blake` | 200; row gone |
| upload url | blake and avery `POST /api/me/messages-upload-url {channelId: DM_AB, contentType: image/jpeg, sizeBytes: 1000}` | 503 "Media storage not configured" |

The upload url: `.env.development.local` blanks the four `R2_*` values on purpose, so this dev server can't sign any URL, before or after wave 1. What wave 1 changed in that route (`git diff`): the storage check moved below auth, the limiter, the publish gate, the body, `ensureMember` and the new club-room guard (the orchestrator's decision); the signing code below it is untouched. A DM gets past the club guard (all 11 club-room requests got 403 `club_media_off`, both DM requests reached the storage step), so on a server with R2 set a DM still gets its URL. Not observable on this stack.

Groups: none exist locally, and one can't be made from the seed accounts. Blake blocks casey (seed, Sept 23), so a group with both is refused ("You can't add one of these people to this chat."), and avery is the only account with mutual follows. The decline and leave above use the request path, which the task allows ("a group or a request"). The group branch of the members route is unchanged in logic (`git diff`: a kick in a `group` still deletes the row).

## 5. SQL checks

- `scripts/sql/chat-v2-after-deploy.sql` (read-only), run twice (after the HTTP tests, and after the rooms check): `summary | 0 findings in 0 clubs; 12 clubs, 45 club rooms checked`.
- `scripts/sql/chat-v2-rooms-check.sql`: exit 0, 200 `chat-check ok` notices, last line `chat-check: all 200 cases passed. Nothing is kept: ROLLBACK follows.` The nine `WARNING: chat-rooms: … failed: chat-check: deliberate failure` lines are the script's own cases checking that the triggers swallow errors (12.16).

## 6. Gates

- `npm run typecheck`: exit 0.
- `npm test`: 1,374 tests, 1,374 pass, 0 fail.
- `npx eslint` on the 16 wave-1 route, lib and share files (incl. `rooms.ts`, `_miniMessenger.js`, `_sharePicker.js`, `SharePostSheet.tsx`): exit 0 (4 warnings). `MessagesMobile.tsx`: 3 errors and 1 warning, exactly the same as HEAD (checked with `git show HEAD:… | eslint --stdin`); `campus-home.tsx`: 0 errors, 6 warnings, the same as HEAD. No new lint errors (14.1).

## Notes (not failures)

1. **The one case that couldn't be reached with the seed data.** POST a room named after an event room's title (the name clash kept by the orchestrator's decision): the seed titles have spaces, so the room-name rule that was already there (`2–31 chars, lowercase letters/numbers/_-`) answers 400 first. B1b showed the clash with a `w1test-dup` event (B1b-routes-notes, repair round 1). One more expectation of mine was wrong and is corrected in the table: drew's room create answers 403 `school_email_required`, because the publish gate runs first, as it did at HEAD.
2. **drew (no club, unverified email) can't send anything** (403 `school_email_required` before any chat rule). So the verified non-member cases use blake on sae's rooms: 403 "Not a member" for send, read, upload url and leave, 403 `members_only` for the room list.
3. **Non-members get the route's old answer, not the club-room code.** A non-member leaving a club room gets 403 "Not a member" (6.6), and declining one gets 200 `{ok: true, already: true}` (15). Neither writes anything, and the cookie client can't see the room, so the route never learns it's a club room. 6.6 and 15 are about people who hold rows. I count these as matches; if the orchestrator wants `club_room` for them too, both routes would need a service-role read of `org_id` first.
4. **The Officers room isn't in anyone's old inbox** (no rows, by decision), so the "· Officers" label in `/api/me/threads` can't be seen over HTTP. `clubRoomLabel` is covered by B0's unit tests.
5. **Missing-schema answers (3.10)** can't be reached over HTTP on a migrated database. B1b's and B4's stub harnesses covered them (their notes). Not rerun here.

## Requests between batches: does each still matter?

| from → to | request | still matters? |
|---|---|---|
| B1b-routes → the owner of the rest of `POST /api/orgs` | When the owner's `org_members` insert fails, delete the club just made before answering 500 `create_failed`, and log a failed delete | **Yes, still open.** `orgs/route.ts:875-883` still answers 500 and keeps the club with no owner and no rooms (`chat_repair_club` runs only after the owner row). HEAD does the same, so it's not a wave-1 regression and doesn't block this pass. A small follow-up in `src/app/api/orgs/route.ts`. |
| B1b-routes → B5 / orchestrator | The `room_locked` sentence reads oddly when someone creates a room named "Lounge" or renames one to "Board" | **Copy only.** The contract pins the sentence, and B5 matches on the code. A separate line on the create and rename screens can wait for wave 2 or Franky. Doesn't block. |
| B4 → wave-2 contract | Read the room description (`room`, `viewer`) on the pinned every-5th-poll re-read, so the 2-second poll can skip `describeRoom` | **Yes, for wave 2.** Not written into the contract yet (section 6.1 pins the re-read but not what it carries). |
| B4 → wave-2 migration B | A grouped reply-count function `(thread_root_id, count)`: live replies plus the caller's own removed ones | **Yes, for wave 2.** Today `reply_count` is a paged walk, and I found it correct (it matches the database per post). |
| B5 → B1b | `POST …/channels` (201) and `PATCH …/channels/[id]` (200) answer without `kind` | **Still true** (seen in this pass: both answers have no `kind`). B5 copes (a PATCH answer is merged into the listed row, a POST row reads as `room`), so it's optional. |
| B5 → the owner of `CampusMobile.tsx` | `synthesizeChannelThread` still titles the room `# ${c.name}` and sends `type: "org"` with no `room_kind` / `can_post` | **Still true** (`src/components/mobile/CampusMobile.tsx:2459-2471`; no wave-1 batch owns this file). ConversationView shows no composer and no Delete until the read answers, so it's safe. Passing `room_kind` and `can_post` from the channel list, and dropping the `#` (section 1 bans `#` in copy), would make the first paint exact. For the browser walk (gate 4) or wave 2. |

## Test rows this pass left in the local database

All recognisable by `w1test`:
- 21 messages starting "w1test int": Board 4 posts (one of them REMOVED_POST, restored) + 5 replies; Lounge 4; Officers 2; GAME 2; COOKOUT 1; SAE_ROOM 1; DM_AB 1; DM_BE 1. One `mention` notification for blake (casey's Board reply).
- The event "w1test integration event": created and cancelled (gone, with its room, rows, messages and RSVPs). It left 3 `event_cancelled` notifications (blake, casey, drew).
- The DM `f128f961` (blake → emery): 1 message, both rows gone (declined, then left), so the channel has 0 members.
- The club `w1test_int_club` (`59789fa5`, owner emery, three rooms): kept, like `w1test_club`, `w1test_club2`, `w1test_club3` and `w1test_club_rev`.
- 4 `moderation_actions` rows (2 removes, 2 restores of REMOVED_POST; append-only).
- avery followed casey and unfollowed her again (the group attempt). The `follow` notification for casey (`98336998`) stays.
- Written and put back: blake's Lounge `accepted_at` (null, then its first value); the topics of chat_seed_club's Board, Lounge and Officers (set, then null again); the room `w1test-int-room` (made and deleted); the reorder wrote the same positions (lounge 0, board 1, officers 2).
