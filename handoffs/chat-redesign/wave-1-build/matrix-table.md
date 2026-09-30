
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
