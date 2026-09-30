# B1b-routes review — behaviour over HTTP (reviewer notes)

Read-only review. Scratch files: scratchpad/b1b-routes-review-http/.

## Log

- Read contract 0, 1, 3.10, 6.0, 8, 14, 15, 16 and the builder's notes.
- Read the five changed files (officer-guard.ts, channels/route.ts, channels/[channelId]/route.ts, channels/reorder/route.ts, the orgs/route.ts hunk) and the three unchanged ones under channels/ (subscribe-public, members, members/[userId]).
- HTTP r1 (r1-list.txt): old list as avery, emery (lounge, board, officers), casey, blake (lounge, board), every row has kind, no event room; drew 403 members_only; signed out 401; hidden club 404. As the contract says.
- HTTP r2 (r2-refusals.txt): the six listed refusals as avery, emery, casey, blake, drew, signed out. Owner and admin: 409 and the body is exactly {"ok":false,"error":"This room can't be renamed, hidden or deleted.","code":"room_locked"} on all six. casey, blake, drew: 403 {"ok":false,"error":"Admin only"} (no code). SQL before = SQL after. NO WRITES.
- After-deploy check before my writes: "0 findings in 0 clubs; 9 clubs, 36 club rooms checked".
- HTTP r3 (r3-create.txt): "OFFICERS", "  Board  ", "board" private, "lounge" with a kind in the body: 409 room_locked, exact body. name 123: 400. Not JSON: 400. WRITE: avery made `w1test-room` 2b7cd92d in chat_seed_club with {"kind":"board"} in the body: 201, SQL kind room (the body's kind is ignored), public, position 100, 4 rows all accepted and read. Same name again (any case) 409 "Channel name already exists" (no code).
- HTTP r4 (r4-room-patch.txt): rename the room to "Officers", " LOUNGE ", "board": 409 room_locked and nothing written (topic, pinned, privacy in the same body untouched). Rename to "general" and to "announcements": 200, kind stays room (only three names are reserved; no code matches on the old names). Renamed back to w1test-room. casey, blake, drew: 403 "Admin only".
- HTTP r5 (r5-room-privacy.txt): test room public -> private 200, rows 4 -> 0 (the trigger's purge; the route's is skipped), blake and casey no longer list it and get 403 on its thread; private -> private with a topic 200; private -> public 200, rows back to 4.
- HTTP r6 (r6-byname-delete.txt): DELETE the test room: casey, blake, drew 403 "Admin only"; signed out 401; emery 200, room and rows gone; again 404 "Channel not found". WRITES: `w1test-room` 2b7cd92d made and deleted. Also: by-name list POST on the Cookout EVENT room with blake: 200 {"ok":true,"granted":true}, an org_channel_members row is written, blake still gets 403 on the room (can_view_org_channel ignores the list for kind event). Row removed again with the DELETE route (200). See finding F1.
- HTTP r7 (r7-core-patch.txt): core rooms: empty name, rename, privacy flip (alone or among allowed fields): 409 room_locked, exact body, nothing written. Topic / pinned / position with name and is_private unchanged (also " OFFICERS "): 200. Only unchanged name + is_private: 400 "Nothing to update". Event rooms (open and closed): 409 room_locked for topic, pinned, position, {}, not JSON, its own name; DELETE 409; casey / blake 403. WRITES: Board and Officers topic set to "w1test topic" and back to null; Officers pinned true and back; Lounge position 5 and back to 0. SQL after = SQL before.
- HTTP r8 (r8-reorder.txt): reorder with an event room id (open or closed, alone or with core rooms): 409 room_locked, exact body, nothing written. Event id together with another club's id or an unknown id: 400 "One or more channel ids don't belong to this org" (the belonging check runs first). casey, blake, drew 403. Core rooms alone: 200. WRITES: positions board 0 / lounge 1, then put back (lounge 0, board 1, officers 2).
- HTTP r9 (r9-club.txt): signed out 401; drew 403 school_email_required. WRITE: emery created club `w1test_club_rev` ("w1test club review", c6e25973) 201. SQL: one member (emery_admin owner); lounge 0 public, board 1 public, officers 2 private, all org_channel, no event_id; emery's rows on lounge and board (role member, accepted, read), none on officers. Its old list as emery: three rooms with kind. blake and avery: 403 members_only. Same handle again 409 handle_taken.
- HTTP r10 (r10-event-name.txt), the name check against event rooms. WRITES (all removed again over HTTP): two events titled `w1test-ev` in chat_seed_club (a8077bf2, 9d0dacc6; their event rooms 5bfce20b, 2bd3c9e5 went with them), two rooms `w1test-ev` (11857c24, 137fae4f; deleted). After the clean-up chat_seed_club has its six rooms as before.

## Findings

### F2 (medium) the name check counts event rooms, and gives way when a name is held twice
- Files: src/app/api/orgs/[slug]/channels/route.ts:190-212 (POST), src/app/api/orgs/[slug]/channels/[channelId]/route.ts:112-121 (PATCH).
- With ONE event titled `w1test-ev`: avery POST …/channels {"name":"w1test-ev"} -> 409 {"ok":false,"error":"Channel name already exists"}; the old list (GET) has no room of that name, so the officer cannot see what is in the way.
- With TWO events titled `w1test-ev` (event titles are not unique): the same POST -> 201, a room `w1test-ev`. Again as emery -> 201, a SECOND room `w1test-ev` (kind room). The old list then shows two rooms with one name. PATCH: renaming 11857c24 away and back to `w1test-ev` -> 200 while three other rows carry the name.
- Cause: both reads end in `.maybeSingle()` and only look at `data`. Two or more matches make PostgREST answer an error (PGRST116) with data null; the routes read that as "no clash". Before wave 1 names were unique per club, so the read never met two rows; event rooms (name = the event's title) break that.
- The after-deploy check does not list a duplicate name (ran it with the duplicates in place: 0 findings).
- Change: in both reads leave event rooms out and stop depending on a single row: `.select("id")…eq("name", v).or("kind.is.null,kind.neq.event").limit(1)` (POST: only when hasRoomKinds; PATCH: only when kind !== null, plus the existing `.neq("id", channelId)`), treat `data.length > 0` as the clash, and answer 500 on a read error that is not a missing schema instead of going on to the insert.

### F1 (low) the by-name list says "granted" on rooms where it grants nothing
- File: src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts:105-186 (POST; unchanged by the batch, which owns every route file under channels/).
- r6 and r11: avery POST …/channels/<Cookout event room>/members {"handle":"blake_iu"} -> 200 {"ok":true,"granted":true}; SQL: an org_channel_members row on a kind event room; blake GET /api/me/threads/<that room>/messages -> 403 "Not a member" (can_view_org_channel ignores the list for an event room). Same 200 on the closed event room and on the Board (public, the list means nothing there). Rows removed again with the DELETE route.
- Change: in POST, after the guard, answer 409 refusalBody("room_locked") when guard.channel.kind is "event", "board" or "lounge" (kind null = old database = today's behaviour). Officers and room stay as they are (decision 27 keeps the by-name list). Needs a line in the contract, section 8 names no rule for this route.

## Log, second sitting (19:11; the first sitting was cut off after r12)

- Read the first sitting's notes and r11 (subscribe-public: all four roles 200 subscribed 0, drew 403, anon 401; by-name list on the Board and the closed event room: 200 granted, rows removed again) and r12 (hidden club test_hidden_club: strangers 404 "Not found", owner avery 409 room_locked; unknown club 404; the create_failed undo in a rolled-back transaction leaves 0 orgs, 0 rooms, 0 members).
- Orchestrator decision: event titles counting in the name clash check is ACCEPTED. F2 is re-framed below to the part the decision does not cover (maybeSingle on two or more rows lets a duplicate through).
- The five owned files unchanged since 17:28-17:30 (mtimes), so the first sitting's evidence stands.
- s2-r13 (s2-r13-refusals.txt): the six listed refusals again on the live tree, avery / emery / casey / blake / drew / signed out. Owner and admin: 409 {"ok":false,"error":"This room can't be renamed, hidden or deleted.","code":"room_locked"} on all six, byte for byte. casey, blake, drew: 403 {"ok":false,"error":"Admin only"} (drew's create: 403 school_email_required from requireCanPublish, which runs first). Signed out: 401. SQL before = after. NO WRITES.
- s2-r14 (s2-r14-room.txt): avery made `w1test-room` 404a99ca (201, SQL kind room, 4 rows), blake's list shows it with kind room; rename to "W1TEST-ROOM" + topic 200 (name unchanged, topic written); rename to "Board" + topic 409 room_locked, topic not written; casey DELETE 403; avery DELETE 200, gone. WRITES: room 404a99ca made and deleted.
- s2-r15 (s2-r15-clubs.txt): the three w1test clubs read again: one owner each; lounge 0 public, board 1 public, officers 2 private, org_channel, no event_id; the owner's rows on lounge and board (accepted, read), none on officers. emery's old list of w1test_club_rev: three rooms with kind; casey 403 members_only. READ ONLY.
- scripts/sql/chat-v2-after-deploy.sql after all of this sitting's writes: "0 findings in 0 clubs; 10 clubs, 39 club rooms checked".
- Gates on the tree as found: npx eslint on the batch's eight files exit 0; npm run typecheck exit 0.

## Findings (final, second sitting; replaces the F1/F2 text above where they differ)

### F2 (medium) re-framed: `.maybeSingle()` in the name check lets a duplicate name through when the name is already held twice
- The decision keeps event titles in the check; that part is NOT a finding. What stays: with two rows of one name (two events titled `w1test-ev`, or a room `rush` and a later event titled `rush`), POST …/channels {"name":"w1test-ev"} answered 201 twice (r10: rooms 11857c24 and 137fae4f, both kind room, same name) and PATCH rename back to `w1test-ev` answered 200. PostgREST answers PGRST116 with data null when maybeSingle meets 2+ rows; both routes read only `data`.
- Files: src/app/api/orgs/[slug]/channels/route.ts:191-212 (readNameClash, `if (clash.data)`), src/app/api/orgs/[slug]/channels/[channelId]/route.ts:112-121.
- Change: in both reads replace `.maybeSingle()` with `.limit(1)` and test `(data?.length ?? 0) > 0` (POST keeps `select(withKind ? "id, kind" : "id")` so the missing-schema detection is unchanged; PATCH keeps `.neq("id", channelId)`). Recommended too: a read error that is not a missing schema answers 500 "Failed to create channel" / "Failed to update channel" instead of going on to the write.

### F1 (low) unchanged: by-name list POST answers 200 granted on an event room, a Board or a Lounge, where the row grants nothing
- File: src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts:113-186. Evidence r6, r11. Needs the orchestrator's call (section 8 names no rule for this route); suggested change as written above (409 refusalBody("room_locked") when guard.channel.kind is event, board or lounge; null kind = today).

### F3 (low, contract wording) the room_locked sentence does not fit two of the cases section 8 gives it
- s2-r13 / s2-r14: POST …/channels {"name":"Lounge"} and PATCH of an extra room {"name":"Board"} answer "This room can't be renamed, hidden or deleted." The desktop create modal (campus-home.tsx:1454-1457) shows that sentence through chatRefusalLine, so an officer creating a new room called Lounge is told "This room can't be renamed…", about a room they are not renaming.
- Not the batch's fault (6.0 pins one sentence per code, 8 pins the code). Change: orchestrator's call, e.g. accept for wave 1, or give B5's create and rename screens their own line for room_locked ("That name belongs to the club's own rooms.") while matching on the code.

## Test writes of this sitting
- room `w1test-room` 404a99ca in chat_seed_club: made and deleted (s2-r14). Nothing else written. Left from the first sitting: club `w1test_club_rev` (c6e25973, owner emery).
