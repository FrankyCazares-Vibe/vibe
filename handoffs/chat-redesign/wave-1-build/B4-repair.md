# B4 repair, round 1 — disposition list

Files: message-read.ts, messages/route.ts, threads/route.ts, members/[userId]/route.ts, messages-upload-url/route.ts (decline route untouched).
Gates after the repair: `npm run typecheck` exit 0; `npx eslint` on the six files exit 0; `npm test` 1374 pass, 0 fail.
Failure paths proven with a read-only harness (scratchpad b4r/run-repair.mjs, 43 checks ALL PASS); the rest over HTTP (log in B4-notes.md, "repair round 1").

## Findings

1. **A failed read of the ?root post answers 404 instead of 503** — FIXED. `rootState` answers yes / no / failed; failed = 503 `try_again`, missing schema stays 404 (harness: 57014 -> 503, 42703 -> 404).
2. **A failed author-role read sends author_role null** — FIXED. `readRoles` answers null on any failed chunk or no service role; `buildChatMessages` reports `complete: false`; `readChatMessages` answers 503 for such a club room, `readChatMessage` null; the send's answer keeps null (`toChatMessages`). Also closed the same hole in `readChatMessage` when `loadRoom` fails without `known.access` (it now asks `ensureMember`; a club room answers null, never a dm-looking message).
3. **viewer.role can be null in a club room** — FIXED. `viewerInRoom(room, role, mayPost)` answers null for no role and the GET answers 503 `try_again` (every viewer past `ensureMember` in a club room is a club member).
4. **reply_count leaves out the viewer's own removed reply** — FIXED. Counted with `removed_at.is.null,user_id.eq.<viewer>` (viewer id from auth, checked as a uuid). HTTP: blake's removed reply counted for blake (rc 1, ?root shows it with `removed`), not for casey (rc 0, ?root empty).
5. **room.event.going can hold fewer than 8** — FIXED. `readGoing` walks the going RSVPs 100 at a time, reads the room rows (service) and then the people on the viewer's client for that step, and only people who come back take a place; a failed read = the whole room 503 (no list with holes).
6. **The thread list serves a failed orgs / org_members read as data** — FIXED. Either error answers 500 "Request failed", like the co-member and hidden-user reads.
7. **A DM or DM request can drop out of the old inbox behind club-room messages** — FIXED. Two preview reads (dm+group ids, club-room ids), each newest first with its own `limit(ids * 5)`, both with the top-level filter and both retries. Kong log for casey: two reads, `limit=10` each.
8. **Leaving a group now waits on a new service-role read** — FIXED. The service read runs only for a kick or when the viewer's own read did not show the channel; a self-leave of a dm/group the viewer can see goes straight to the delete (HTTP: 1 channels read, 200). A kick keeps 500 on a failed read (fail closed, as built).
9. **Club-room thread GET costs 2-4x the calls** — FIXED (a), (b); (c) is a request. (a) one service read of going+maybe RSVPs with an exact count gives both counts, `viewer_status` and the going order (the HEAD counts and own-RSVP read come back only past 500 RSVPs). (b) the viewer's role rides on the authors' `org_members` read (`readChatMessages` -> `viewerRole`; the route calls `describeRoom` + `viewerInRoom`; `readThreadRoom` kept for other callers). Kong log: event room 17 -> 13 calls, Board 10 -> 9, DM 6 unchanged. (c) the contract is not mine to edit: sent to the orchestrator.
10. **?after= with an impossible time answers 500** — FIXED. `cleanAfterParam` also checks the fields (month, day in month, hour, minute, second, zone) with its own arithmetic, not `Date.parse`, so every string the server sends still passes; `2026-13-45T25:61` and `2026-02-30` answer 400. `before` left as today (contract: "`before` and `limit` unchanged").
11. **`before` with `root` or `after` returns the oldest rows** — FIXED. `oldestFirst = (after || root) && !before`: a `before` page is always the newest rows before T (HTTP: root+before+limit=1 -> ea0f1139).
12. **reply_count downloads every reply row and undercounts past 5,000** — FIXED for now. The first page reads `count: 'exact'`, the walk continues until it has seen that many rows (safe with any max_rows), and past 5 pages per 100 posts the count is null, never low. The grouped-count RPC is a wave-2 request (no SQL in this batch).
13. **readChatMessages trusts its limit, after and before** — FIXED. `clampReadLimit` (1..200, whole number; 50, or 200 with root) and the `after` check run inside `readChatMessages` (400 "Invalid after"); the route uses the same `clampReadLimit`. `before` unchanged (contract).
14. **rootIsThere compares channel ids as strings** — FIXED. Lower-case compare; HTTP: upper-case path + ?root -> 200 with the 3 replies.

## Orchestrator decisions applied

- **Upload url: club-room guard ahead of the storage check** — DONE. `isR2Configured()` now runs after auth, limiter, publish gate, body, `ensureMember` and the club guard. HTTP locally: Lounge / Board 403 `club_media_off`, DM 503 "Media storage not configured", signed out 401.
- **POST: RLS refusal after the gate said yes** — DONE. `canPostAnswer` asked once more: "no" -> `postRefusal` code; "yes" / "failed" -> 500 logged as CONTRACT BUG (with `gateAgain`). Not reachable over HTTP without a real race; read in code.
- **?after= 400 without code, ?root= default 200, any media to a club room = club_media_off, the middle retry** — kept as built.

## For the orchestrator

- Wave-2 contract (finding 9c): the pinned every-5th-poll re-read is where the room description (`room`, `viewer`) should move; the per-poll GET could then skip `describeRoom`.
- Wave-2 migration B (finding 12): a grouped reply-count RPC `(thread_root_id, count)` so `reply_count` is one call, not a walk over rows.
