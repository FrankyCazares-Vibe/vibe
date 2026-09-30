# B1b-core review — behaviour over HTTP and SQL

Reviewer, read-only. Files judged: `src/lib/chat/rooms.ts`, `src/lib/messages/channel-access.ts` (ensureMember).
Scratch: scratchpad/b1b-core-review-behaviour/.

## Log

- Read contract 0, 1, 3.4, 3.5, 3.6, 3.10, 6.0, 6.1, 6.2, 8, 14, 15; the builder's notes; both files and the diff.
- SQL matrix (matrix.sql; `set local role authenticated` + `request.jwt.claims` per account, begin … rollback): can_view / can_post(top-level) for lounge, board, officers, Game Night, Cookout, a dm, an unknown id, as avery, blake, casey, drew, emery. All 35 cells equal contract 3.5. `can_view_org_channel` answers NULL (no row) for an unknown id; the helpers compare with `=== true`, so that reads as no.
- Local database has NO closed event room: the Callout (ended 11 days ago) has no room at all (the repair only creates rooms inside the window), the Cookout (ended 4 days ago) is in its `after` state and still open. The closed case was tested in SQL by moving an event's `ends_at` inside a rolled-back transaction.
- HTTP matrix (http-matrix.txt): GET /api/me/threads/<id>/messages as blake, casey, emery, avery, drew for lounge, board, officers, Game Night, Cookout, the avery-blake dm, an unknown id, a malformed id. 40 answers, every status equals the SQL `can_view` cell (200 where true, 403 where false / null). drew: 403 on all eight.
- SQL post matrix (post-matrix.sql, fixtures inserted and rolled back: a reply, a removed Board post, a post on SAE's Board, the Cookout moved to 8 days ago, a row for blake on it): 75 cells, all equal the 3.5 table. Closed room: still readable (avery, emery, blake with a row), nobody can post. Database left as it was (10 messages, 2 Cookout rows).
- Real helpers against the local database (run1.mjs, run2.mjs, run3.mjs; read-only): ensureMember for 5 accounts x 9 rooms, loadRoom, filterRoomReaders, clubRole, canPost. Every yes / no equals the SQL cell. The dev server's compiled chunk has the new `org_id, kind, event_id` read. `/api/users/search?channel_id=` (the other reader of ensureMember) answers as the matrix says.
- Real PostgREST error shapes: a missing column is 42703 (HTTP 400), a missing function is PGRST202 (HTTP 404); both are read as missing schema. A network failure has `code: ''` and is NOT read as missing schema (500, no retry).

## Findings

### F1 (medium) canPost cannot say "the question failed"; 14.4's 503 `try_again` cannot be sent
- File: src/lib/chat/rooms.ts:175-187 (and the signature at :159-164).
- Evidence (run3.mjs, real local PostgREST, a token it cannot read): raw rpc -> 401 `PGRST301 JWT cryptographic operation failed`; `canPost(owner, Lounge)` -> false; `canPost(owner, Board)` -> false; with the database unreachable `canPost(member, Lounge)` -> false. The route then has only `postRefusal`, which answers `room_closed` for all three: a club's owner is told "This chat is closed." (403) in the Lounge because a read failed. Contract 14.4: "on any other RPC error it answers false and the route sends 503 `try_again`" - the route cannot tell.
- Change: keep `canPost` as typed, and add beside it `askCanPost(client, channelId, userId, rootId): Promise<"yes" | "no" | "failed">` holding today's body (missing schema -> "yes", error / throw -> "failed", `data === true` -> "yes", else "no"); `canPost` becomes `(await askCanPost(...)) === "yes"`. B4 calls `askCanPost` and answers 503 `try_again` on "failed". This needs the orchestrator's yes (a fifth export in rooms.ts).

### F2 (low) canPost reads a root that is present but not a string as "no root" and answers yes
- File: src/lib/chat/rooms.ts:166.
- Evidence (run3.mjs, as blake, the Lounge): root = 123 -> true; root = ["587408ab-…"] -> true; root = {"id":1} -> true; root = true -> true. The database answers false for any root in a Lounge (post-matrix.out: `lounge root=loungeMsg` f for everyone). A route that hands `body.thread_root_id` over unchecked gets "allowed" for a send that carries a root.
- Change: line 166-168 -> `if (rootId !== null && rootId !== undefined && typeof rootId !== "string") return false;` before the trim; keep blank string = no root (postRefusal reads it the same way).

## Log (continued)

- Gates re-run by the reviewer: `npx eslint` on the two files exit 0; `npm run typecheck` exit 0; `npm test` 1374 pass, 0 fail (the count did not move: the batch added no test).
- Members-only checks over HTTP in two other clubs: blake holds a `going` RSVP to Open Club Study Night but is not in that club -> 403; avery (plain member of test_request_club, no RSVP) -> 403 on its event room and Officers, 200 on its Board; blake (owner there) -> 200 on all three.
- Leftover rows (leftover.sql, rolled back): drew given a `channel_members` row on Game Night and on the Lounge still reads no channel row, `can_view` f, `can_post` f, 0 messages. ensureMember answers 403 before either branch.

### F3 (low) loadRoom answers null for a club room when a read fails, which is the contract's answer for "a dm or a group"
- File: src/lib/chat/rooms.ts:99-103 and :117-127.
- Evidence: read of the code plus run1.mjs (dm -> null, unknown id -> null). A failed `channels` read, a failed `events` read and an event row that cannot be read all answer null too. With null, `postRefusal(null, null, role)` answers `room_closed` for a member's top-level post on a Board (it should be `board_officers_only`), and the thread GET would send `room: null`, which screens read as "this is a dm".
- Change: nothing in the four signatures. In the doc comment of `loadRoom` (rooms.ts:75-87) add the rule for callers: "`ensureMember` already said whether this is a club room (`isOrgChannel`, `kind`); when it carried a `kind` and `loadRoom` answers null, the read failed: answer 503 `try_again`, never treat the room as a dm." B4 applies it in both verbs.

### F4 (low) the comment on UUID_SHAPE states something that is not true here
- File: src/lib/chat/rooms.ts:33.
- Evidence: "Looser than `isUuid` (pgrest.ts), which refuses the local seed's ids." SQL: ids that fail the `isUuid` pattern: channels 0 of 30, users 0 of 7, messages 0 of 10, orgs 0 of 7, events 0 of 8. ensureMember (channel-access.ts:59) uses the strict `isUuid`, so for an id only the loose pattern accepts the two files disagree (ensureMember 403 without asking, loadRoom / canPost ask the database).
- Change: use `isUuid` from "@/lib/pgrest" in rooms.ts and delete UUID_SHAPE / isId, or keep the loose pattern and reword the comment to "any uuid Postgres accepts; ensureMember, asked first, is stricter".

### F5 (low, for the orchestrator, not this batch's files) there is no closed event room in the local database
- Evidence: SQL `select … from events`: the Callout (ended 2026-09-19) has no `channels` row; every one of the 7 event rooms is inside its window (`open` = t). The closed-room read could not be made over HTTP; it was made in SQL by moving the Cookout inside a rolled-back transaction (view: avery t, emery t, blake with a row t, casey f, drew f; post: f for all).
- Change: for the integration pass, one by-hand local step before the HTTP run: `update public.events set starts_at = now() - interval '9 days', ends_at = now() - interval '8 days' where title = 'Chat Seed Cookout';` (local only), or a seed event created after the triggers exist with `ends_at` 10 days ago.

## Not found
- No answer over HTTP or SQL differs from contract 3.5 or 3.4 for the five accounts and the rooms above.
