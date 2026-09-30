# B1b-routes review — lens: SECURITY AND GATES

Reviewer, read-only. Judged files: `src/app/api/orgs/route.ts` (default-rooms part of POST), `src/app/api/orgs/[slug]/channels/**`, `src/lib/club-routes/officer-guard.ts`.

## Log

- Read contract 0, 1, 3.10, 6.0, 8, 14, 15, 16 and the builder's notes.
- Read the diff and the full text of the five changed files and the three unchanged route files under channels/ (subscribe-public, members, members/[userId]).
- Read the live database: triggers, constraints, `chat_repair_club`, `chat_channels_fill_kind`, `chat_channels_subscribe`, `can_view_org_channel`, the policies and grants on `channels` (authenticated has no INSERT / UPDATE grant and no DELETE policy, so the routes are the only writers).
- Another reviewer is using chat_seed_club right now (a room `w1test-room` 2b7cd92d is there that the builder's notes say was deleted). My writes go to `w1test_club2` only.
- HTTP round 1 (scratchpad b1b-routes-review-security/round-1-hidden.txt), test_hidden_club: signed out 401; drew, blake and emery (strangers) get 404 on GET list, POST (also with the name "Lounge"), PATCH, DELETE and reorder; an unknown club answers the same 404. drew's POST stops at the publish gate (403 school_email_required) for a hidden and an unknown club alike. NO WRITES.
- HTTP round 2 (round-2-names.txt), avery on w1test_club2, POST with 15 name variants: "Lounge", "  BOARD  ", NBSP / BOM / em-space / line-separator around a reserved name: 409 room_locked. Zero-width space, Cyrillic o, full-width letters, the ff ligature, long s, a NUL, an array, an object: 400 (the name regex). A body with two `name` keys: the last one counts, for the check and the insert alike. WRITE: room `w1test-sec-dup` 9e8c943c in w1test_club2 (from the two-keys case).
- HTTP round 3 (round-3-patch-cross.txt): renaming that room to "Board", NBSP+"OFFICERS"+BOM, "lounge" (with a topic beside it): 409, nothing written; Cyrillic / zero-width: 400. Cross-club: avery (owner of both clubs) asking w1test_club2 for chat_seed_club's Board or an event room: 404 on PATCH and DELETE, 400 on reorder; emery (admin of chat_seed_club) asking chat_seed_club for w1test_club2's room: 404; emery on w1test_club2: 403. NO WRITES.
- SQL, two transactions that were rolled back (nothing left: 0 clubs named w1test_sec_tx*): (1) as service_role: club + owner row + `chat_repair_club` + `delete from orgs` -> club, rooms, member row and the owner's follower row all go, no error; every foreign key to `orgs` is ON DELETE CASCADE. (2) the fallback insert (general + announcements, no kind) on THIS migrated database -> lounge + board, no Officers room.

## Findings

### F1 (medium) club creation: a failure INSIDE `chat_repair_club` can read as "old database" and keep a club without its Officers room
- File: `src/app/api/orgs/route.ts:897` (`if (roomsErr && isMissingChatSchema(roomsErr))`).
- `isMissingChatSchema` answers yes for 42703, 42P01, 42883, PGRST204, PGRST205, PGRST202. For an RPC only two of those can mean "the function is not there": PGRST202 and 42883. The other codes can only come from inside a function that EXISTS (a column or table it reads was renamed or dropped by a later migration; plpgsql finds that at run time). That is "any other failure" in section 8, but the route takes the old-database path: two rows `general` + `announcements`, 201.
- On a migrated database those two rows become lounge + board (`chat_channels_fill_kind`), so the club is kept with two rooms and NO Officers room, and nothing tells anyone (SQL above, transaction 2). The builder's own stub run says the same: "PGRST202 / 42883 / 42703 -> 201 and today's two rows".
- Change: in the club-creation branch decide on the function only: `const code = String((roomsErr as { code?: unknown })?.code ?? "").toUpperCase(); const functionMissing = code === "PGRST202" || code === "42883";` and use `functionMissing` where `isMissingChatSchema(roomsErr)` stands. Everything else (42703 and 42P01 included) goes to the delete + 500 `create_failed` branch.

## Log (continued)

- HTTP round 4 (round-4-fields.txt), avery on w1test_club2: public -> private 200, rows 1 -> 0 (the database's purge); back to public 200, rows 0 -> 1. A PATCH and a POST that also carry `kind`, `event_id`, `org_id`, `type`: those four are ignored (SQL: kind room, type org_channel, the club's own org_id, no event_id). A JSON body of `null`: empty 500 on PATCH, POST and reorder (see F5). WRITES: topic "w1test sec" on my room; a second room `w1test-sec-kind` ec1cba68.
- Round 5 (round-5-cleanup.txt): both of my rooms deleted over HTTP (200, 200). w1test_club2 is back to lounge, board, officers with avery's two rows.

## Log, second sitting (the first was cut off after round 6, direct PostgREST calls, was saved)

- Read the first sitting's notes and scratch files (rounds 1-6). Round 6 (round-6-direct.txt): as blake straight to PostgREST, `chat_repair_club` on chat_seed_club 403 "not allowed", anon 401; direct UPDATE / INSERT on channels 403 (no grant); direct DELETE on another club's room 200 [] (nothing deleted, no policy); blake reads chat_seed_club's two event rooms by table read (he is a member of the club; not a change of this batch).
- Re-read the five changed files in full and the diff against HEAD; the DB: triggers and constraints on channels (no DB rule stops a `room` from carrying a core name; the routes are the only guard, as designed), `chat_channels_fill_kind` (a sent `kind` is kept, so a room named `announcements` or `general` stays a `room`), `can_view_org_channel`, the triggers on orgs / org_members / org_channel_members.
- Null JSON body 500s (round 4) are the same in HEAD (`typeof body.name` / `body.channel_ids` on null): pre-existing, no leak (POST and reorder crash before any club lookup, PATCH only after the officer guard). Kept as a low note (F2).
- Gates in this sitting: `npx eslint` on the five files exit 0. After-deploy check (read-only): "0 findings in 0 clubs; 10 clubs, 39 club rooms checked" (10 = another reviewer's test club added).
- Gate order checked line by line against HEAD: POST …/channels auth -> publish gate -> body -> name regex -> word filter -> officer guard (hidden 404) -> reserved name -> clash -> insert; PATCH / DELETE auth -> restriction -> guard -> channel of this club -> kind; reorder auth -> body -> restriction -> guard -> ids of this club -> kind; GET auth -> org -> membership (hidden 404 / 403) -> user-client read. Every new refusal sits after the guard, so a stranger learns nothing new. Service role only where it was plus the two uses section 8 names (the repair call and the undo delete, which is keyed on the id the insert just returned).
- Name bypass: after `trim().toLowerCase()` only ASCII `[a-z0-9_-]` passes the regex; no non-ASCII letter lower-cases to one of b o a r d l u n g e f i c s (Kelvin sign -> k and U+0130 -> i + U+0307 are the only such cases; neither helps). No bypass found.

### F2 (low, pre-existing) a JSON body of `null` crashes POST, PATCH and reorder with an empty 500
- Files: `src/app/api/orgs/[slug]/channels/route.ts:161`, `…/[channelId]/route.ts:88`, `…/reorder/route.ts:43`.
- Evidence: round-4-fields.txt, avery, body `null`: PATCH, POST, reorder each `-> HTTP 500` with an empty body (`typeof body.name` / `body.channel_ids` on null throws). HEAD has the same lines, so not a regression, and no leak (POST and reorder throw before any club lookup; PATCH only after the officer guard).
- Change: after each `req.json()`, `if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });`.

### F3 (low, pre-existing, outside the owned hunk) a failed owner row still keeps a half-made club
- File: `src/app/api/orgs/route.ts:880-882`.
- Evidence (lines read): when the `org_members` insert fails the route answers 500 `create_failed` "Failed to add owner row" and returns; the club row stays, with no owner row and (now) no rooms, because `chat_repair_club` never runs. Same as HEAD. The rooms hunk deletes the club on its own failure; this earlier exit does not.
- Change (for whoever owns that part): before that `return`, `await service.from("orgs").delete().eq("id", org.id)` (log its error), like the rooms branch.

## Closing (second sitting)

- Findings: F1 (medium), F2 (low, pre-existing), F3 (low, pre-existing, outside the owned hunk). No high finding: no leak to a stranger or a non-member, gate order unchanged, no bypass of the reserved names, the undo can only delete the club just made.
- Writes of this review left in the local database: none (w1test-sec-dup 9e8c943c and w1test-sec-kind ec1cba68 in w1test_club2 were made and deleted over HTTP in the first sitting; the two SQL transactions were rolled back).
- No file changed except this notes file.
