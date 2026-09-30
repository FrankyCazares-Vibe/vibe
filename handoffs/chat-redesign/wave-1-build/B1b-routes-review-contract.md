# B1b-routes review — lens: CONTRACT AND FALLBACKS

Reviewer, read-only. Judged files: `src/app/api/orgs/route.ts` (default-rooms part of POST), `src/app/api/orgs/[slug]/channels/**`, `src/lib/club-routes/officer-guard.ts`.

## Log

- Read contract 0, 1, 3.10, 6.0, 8, 11, 14, 15, 16 and the builder's notes (two sittings).
- Read the diff and the full text of the five changed files (officer-guard.ts, channels/route.ts, channels/[channelId]/route.ts, channels/reorder/route.ts, orgs/route.ts POST hunk).
- Read the live bodies of chat_repair_club, chat_channels_fill_kind, chat_channels_subscribe, can_view_org_channel, the constraints and indexes of `channels` (no unique index on org_id + name).
- HTTP round 1 (scratchpad b1b-routes-review-contract/round-1.txt): the six required refusals as avery, emery (409 room_locked + the sentence), casey, blake (403 "Admin only"). As the builder logged. NO WRITES.
- HTTP round 2 (round-2.txt): old list as avery, emery, casey, blake, drew, signed out: `kind` on every row, no event room; 403 members_only; 401. Core rooms with an unchanged `name` / `is_private` answer 400 "Nothing to update", not 409 (see finding 1). Event room: 409 for `{}` and for a body that is not JSON. POST " OFFICERS ", "bOaRd": 409 room_locked. NO WRITES by me. (Rooms `w1test-room` in chat_seed_club and `w1test-sec-dup` in w1test_club2 are other reviewers' test rooms, not mine.)
- Read the builder's stub harness (scratchpad b1b-routes: harness.mjs, wrap.mjs, hooks.mjs, run-old-db.mjs, run-club.mjs) and its outputs: it runs the real handlers, writes recorded and not sent. The five files were last saved 17:28-17:30, before all of the builder's evidence.
- SQL: w1test_club and w1test_club2 each have lounge 0 public, board 1 public, officers 2 private; the owner holds rows on lounge and board (role member, accepted, read), none on officers.
- Club undo rehearsed in SQL inside begin ... rollback as service_role (delete of w1test_club2): club, rooms and member rows go, no error; rolled back, the club is still there.
- Gates on the tree as found: `npx eslint` on the owned files exit 0; `npm run typecheck` no errors.
- HTTP round 3 (round-3.txt), edges. JSON `null` as the body: 500 with an EMPTY body on PATCH, POST and reorder (finding 4). `{"name":["news"],"is_private":"true"}` on the Board 400 "Nothing to update". "board" + a zero-width space on the Board 409 room_locked. Closed Night event room: DELETE 409, reorder 409. Another club's Board id under w1test_club2: 404. SAE's Board DELETE 409. WRITES: one PATCH on chat_seed_club's Lounge answered 200 and wrote topic null and pinned false, which is what they were (SQL after = SQL before).
- `npm test`: 1374 / 1374 pass. After-deploy check: "0 findings in 0 clubs; 10 clubs, 40 club rooms checked".
- HTTP round 4 (round-4.txt): emery created `w1test-rc` in chat_seed_club (sent as "W1test-RC"; 201; SQL kind room, public, position 100, 4 rows). Same name again 409 "Channel name already exists" (no code). Rename to "Officers" and to " LOUNGE " with a topic: 409 room_locked, nothing written. Same name + is_private true: 200, rows 4 -> 0 with the route's purge skipped. casey DELETE 403; avery DELETE 200; gone in SQL. The 201 and the 200 carry no `kind`. WRITES: the room `w1test-rc` 652eab57, made and deleted.
- Final state: chat_seed_club's six rooms as before my tests (kinds, names, privacy, positions, topics null, rows 4/4/0/3/2/4). After-deploy check: "0 findings in 0 clubs; 10 clubs, 39 club rooms checked". Nothing of mine is left in the database.

## What I left in the local database

Nothing. `w1test-rc` was made and deleted. One PATCH on the Lounge wrote the values it already had.

## Findings (most severe first; no high, no medium)

What differs from the contract's text, or is weak in a fallback.

### 1. LOW — PATCH on a Board, Lounge or Officers room accepts `name` and `is_private` when they equal what the room has; section 8 says they are refused

- File: `src/app/api/orgs/[slug]/channels/[channelId]/route.ts:95-100` (the refusal only when the value differs), `:103` and `:134` (the unchanged value is dropped, not written).
- Contract, section 8: "for `board`, `lounge`, `officers`: `name` and `is_private` refused with 409 `room_locked`". No word about an unchanged value.
- Evidence (avery, chat_seed_club):
  - `PATCH …/channels/<board> {"name":"board"}` -> 400 `{"ok":false,"error":"Nothing to update"}` (the text says 409 `room_locked`).
  - `PATCH …/channels/<board> {"is_private":false}` -> 400 "Nothing to update".
  - `PATCH …/channels/<officers> {"name":"OFFICERS","is_private":true}` -> 400 "Nothing to update".
  - `PATCH …/channels/<lounge> {"name":"Lounge ","is_private":false,"topic":null,"pinned":false}` -> 200.
- Why it was built so: the desktop settings modal sends `name`, `topic`, `is_private`, `pinned` on every save (`campus-home.tsx:2069-2076`, `:3350-3358`); read literally, the topic of a core room could never be saved there. B5 now relies on it (B5-notes line 28: "No 'send only what changed' hunk needed").
- The builder reported it (its point 1) but built its own reading; the contract was not changed.
- Change: no code change. The orchestrator adds one sentence to section 8, PATCH bullet: "A `name` or `is_private` equal to the room's own value (name compared trimmed, lower-case) is not a change: it is not refused and not written." If the literal text is wanted instead: delete the `renamed` test and the `body.is_private !== guard.channel.is_private` test so any string `name` / boolean `is_private` on a core room answers `roomLocked()`, and B5 must then send only the fields that changed.

### 2. LOW — a failure INSIDE `chat_repair_club` with a "missing" code is read as "old database": the club is kept with two rooms and no Officers room

- File: `src/app/api/orgs/route.ts:897` (`if (roomsErr && isMissingChatSchema(roomsErr))`).
- For an rpc call only PGRST202 and 42883 say "the function is not there". 42703 / 42P01 / PGRST204 / PGRST205 coming back from the rpc mean the function ran and its body hit a missing column or table (a later migration renamed something it reads: `rsvps.status`, `channel_members.last_read_at`, ...). That is "any other failure" in section 8 (delete the club, 500 `create_failed`), but the code takes the two-row path.
- Evidence: the builder's own stub run, scratchpad `b1b-routes/s2/stub-club.txt`: "PASS 42703: 201 and today's two rows", "the club is kept -> false". On a migrated database those two rows become Lounge and Board through `chat_channels_fill_kind` (section 15.7), so the club is answered 201 with no Officers room, and the only trace is one `console.warn` per server instance (`warnMissingChatSchemaOnce`), which says the migration "isn't in this database yet".
- Change, `src/app/api/orgs/route.ts:897`: decide "function missing" by the two function codes only, for example
  `const code = typeof (roomsErr as { code?: unknown } | null)?.code === "string" ? String((roomsErr as { code: string }).code).toUpperCase() : "";`
  `const noRepairFunction = code === "PGRST202" || code === "42883";`
  and use `noRepairFunction` in place of `isMissingChatSchema(roomsErr)`. Section 3.10 names `isMissingChatSchema` as the test, so this needs the orchestrator's yes; if the answer is no, leave the code and add the case to the after-deploy routine (a club created after a schema change is checked with `chat-v2-after-deploy.sql`).

### 3. LOW — room names are unique against event rooms too, and two rows with one name switch the check off

- Files: `src/app/api/orgs/[slug]/channels/route.ts:190-197` and `:210-212` (POST; `kind` is selected there but never looked at), `src/app/api/orgs/[slug]/channels/[channelId]/route.ts:112-121` (PATCH).
- An event room's name is its event's title (`left(e.title, 80)`), in the same `(org_id, name)` space, and the old list leaves event rooms out. The clash read filters on `org_id` and `name` only. SQL with the same predicate: `select id, kind, name from channels where org_id = <chat_seed_club> and name = 'Chat Seed Game Night'` -> `bed10830…|event|Chat Seed Game Night`.
  - An event titled with one lower-case word ("formal", "tailgate", "bbq") makes `POST …/channels {"name":"formal"}` and a rename to it answer 409 "Channel name already exists" for a room the officer cannot see in the list.
  - Once a room and an event room share a name, `.maybeSingle()` answers an error (PGRST116, more than one row) and `data: null`; the error is not read (`:210`, `:119`), so the next room of that name is created: two rooms of one name in the old list. `channels` has no unique index on `(org_id, name)`.
- Read, not run (it needs an event with a slug-shaped title; I made none). The builder named the first half (its point 4).
- Change: where `kind` can be read, leave event rooms out of both clash reads and stop depending on "exactly one row":
  POST `:191-196` -> `.select(withKind ? "id, kind" : "id").eq("org_id", org.id).eq("name", name)` + `withKind ? .or("kind.is.null,kind.neq.event") : (nothing)` + `.limit(1)`, then `if ((clash.data ?? []).length > 0)`.
  PATCH `:112-118` -> the same `.or(...)` when `kind !== null`, `.limit(1)`, `if ((clash ?? []).length > 0)`.

## Log, second sitting (19:11; the first was cut off after finding 3, before finding 4 was written)

- The five files are unchanged since 17:28-17:30 (mtimes), so the first sitting's evidence stands. Orchestrator decisions now in the task: finding 1 (unchanged name / is_private not refused) is ACCEPTED AS BUILT and is withdrawn; the first half of finding 3 (an event's title counts in the name clash) is ACCEPTED AS BUILT; only its second half (two rows of one name switch the check off) stays.
- s2 HTTP round 1 (scratchpad b1b-routes-review-contract/s2-round-1.txt, NO WRITES): the six required cases as avery and emery -> 409 `{"ok":false,"error":"This room can't be renamed, hidden or deleted.","code":"room_locked"}` each; casey and blake -> 403 "Admin only" each (accepted body).
- s2: JSON `null` body re-sent as avery: PATCH lounge, POST channels, POST reorder -> 500 with an empty body, all three. `git show HEAD:` of the three files: the old code read `body.name` / `body.channel_ids` on the same null, so this is PRE-EXISTING, not made by the batch.

### 4. LOW (pre-existing) — a JSON `null` body is a 500 with an empty body on PATCH, POST and reorder

- Files: `src/app/api/orgs/[slug]/channels/[channelId]/route.ts:86-95`, `src/app/api/orgs/[slug]/channels/route.ts:159-166`, `src/app/api/orgs/[slug]/channels/reorder/route.ts:41-49`.
- Evidence: `curl -X PATCH …/chat_seed_club/channels/<lounge> --data 'null'` -> `500` and no body; the same for `POST …/channels` and `POST …/channels/reorder`. `req.json()` answers `null`, the cast lets it through, `body.name` / `body.channel_ids` throws a TypeError. The pre-wave code at HEAD has the same reads (`typeof body.name` at HEAD :71 and :136, `body.channel_ids` at HEAD :41), so wave 1 did not cause it.
- Change (optional, same answer the routes already give for bad JSON): after each `body = (await req.json()) as …;` add `if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });` (inside or right after the try). No contract text is touched.
- s2: old list re-read: blake `lounge:lounge, board:board`; avery `lounge:lounge, board:board, officers:officers` (no event room, every row has kind). SQL of w1test_club / w1test_club2 / w1test_club_rev (the last is another reviewer's): lounge 0 public, board 1 public, officers 2 private, owner's rows on lounge + board (member, accepted, read), none on officers.
- s2: postgrest-js `maybeSingle()` read in node_modules (dist/index.mjs:356-368): more than one row -> `error` PGRST116 and `data: null`. `chat_events_room` names an event room `left(new.title, 80)` on INSERT and on a title UPDATE, so a room and an event room of one name are reachable (room first, then an event titled with that slug-shaped name, or an event retitled to it).
- s2 gates: `npx eslint` on the eight files under the batch's paths exit 0; `npm run typecheck` exit 0; `npm test` 1374 / 1374; after-deploy check "0 findings in 0 clubs; 10 clubs, 39 club rooms checked". NO WRITES in this sitting.

## Findings after the orchestrator's decisions (these replace 1-4 above)

- Finding 1: WITHDRAWN (accepted as built by the orchestrator).
- Finding 2: stands, LOW, needs the orchestrator's yes (it narrows the 3.10 test for this one call).
- Finding 3: only its SECOND half stands, LOW. The event title counting in the clash check is accepted; what is left is that TWO rows of one name make `.maybeSingle()` answer PGRST116 + `data: null`, the error is not read, and the route creates (POST `channels/route.ts:190-212`) or renames to (PATCH `[channelId]/route.ts:112-121`) a THIRD row of that name. Change that keeps today's check (event rooms still count): replace `.maybeSingle()` with `.limit(1)` in both reads and test `(clash.data ?? []).length > 0` (POST) / `(clash ?? []).length > 0` (PATCH); and when the read answers an error that is not missing schema, answer 500 "Failed to create channel" / "Failed to update channel" instead of going on.
- Finding 4: stands, LOW, PRE-EXISTING (JSON `null` body -> 500 empty body).
