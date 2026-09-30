# B1b-core notes (rooms.ts + ensureMember)

Files owned: `src/lib/chat/rooms.ts`, `src/lib/messages/channel-access.ts` (ensureMember only).

## Log

- Read contract 0, 1, 3.5, 3.10, 6.0, 6.2, 8, 14, 15; asis 8.2 and 10. Local database has `channels.kind`, `channels.event_id`, `can_post_org_channel`, `can_view_org_channel` (with the event arm).
- Local rooms of chat_seed_club: board d3c31eb8, lounge 3ea7db07, officers 00d7087f, event Game Night bed10830, event Cookout 4715d19f. No room for the Callout (ended 11 days ago).
- Baseline over HTTP BEFORE any edit (scratchpad b1b-core/before.txt): blake lounge 200 (4 messages), board 200 (1), Game Night 200 (0), officers 403, dm 200 (2), unknown id 403, malformed id 403; drew 403 on all seven. users/search?channel_id= 200 for both (drew gets an empty list).
- ensureMember edited: one read of `org_id, kind, event_id`; on isMissingChatSchema it warns once and repeats with `org_id`; club variant now carries `kind` and `eventId`. dm / group branch untouched.
- rooms.ts filled: loadRoom, canPost, filterRoomReaders, clubRole with the four 14.4 signatures. Nothing throws; a failed read is logged once per function and answers the closed side (null / false / left out / null). canPost answers true only for isMissingChatSchema.
- Choices the contract leaves open (reported in the final answer): loadRoom answers null on a read failure; an event room whose event cannot be read answers null (never `event: null` on an event room); canPost answers false without asking for an id that is not a uuid; filterRoomReaders keeps input order, drops duplicates, asks 20 at a time.
- Checks: `npx eslint src/lib/chat/rooms.ts src/lib/messages/channel-access.ts` exit 0; `npm run typecheck` exit 0; `npm test` 1374 pass, 0 fail.
- HTTP after the edit (dev server on 3100, its compiled chunks contain the new `org_id, kind, event_id` read): same status for all 18 cases as before the edit; bodies identical except the key order of `reactions` inside one Lounge message (same content).
  - blake: lounge 200, board 200, Game Night 200, dm 200, officers 403, unknown id 403, malformed id 403.
  - drew: lounge 403, board 403, Game Night 403, officers 403, dm 403, unknown 403, malformed 403. The refusal body is today's `{ ok:false, error:"Not a member" }` with no `code` (the route is B4's).
- Direct calls of the real functions against the local database (scratchpad b1b-core/run-access.mjs, 84 checks, all pass; output in harness-out.txt):
  - loadRoom: lounge, board, officers, Game Night and Cookout (with the event, dates as the database sent them), dm / unknown / malformed → null.
  - clubRole: avery owner, emery admin, casey mod, blake member, drew null.
  - filterRoomReaders: lounge and board → avery, blake, casey, emery; officers → avery, emery; Game Night → avery, blake, casey, emery; dm → nobody; 50 ids in three groups.
  - canPost through each person's own session: member cannot post on the Board but can reply under a post; owner / admin can post; mod cannot; a root from another room, an unknown root and a root outside a Board are refused; Cookout is open to the owner (ended 4 days ago) and closed to blake (not in the room); asking about someone else's id is refused. PGRST202 and 42883 → true; 57014, a throw, a null answer → false; one warning and one error logged for six failures.
  - ensureMember: club variant carries kind / eventId; dm variant has neither key; with the wide read answering 42703 or PGRST204 it reads twice and answers kind null / eventId null with the same 200 / 403 decisions; any other error is a 500 and is not retried.
- Writes made: NONE. Every HTTP request was a GET and every harness call a read (the harness signs the five seed accounts in on the local auth server).

## For the orchestrator

- Contract gap: `canPost` returns a boolean, so the route cannot tell "refused" from "the RPC failed"; 14.4's 503 `try_again` cannot be produced from it. As built, a failed RPC reads as a refusal and the route will answer whatever `postRefusal` picks.
- `canPost` and `filterRoomReaders` are for club rooms only: both answer no / nobody for a dm or a group, because the database functions do.

## Repair round 1 (Sept 29)

- Started. Dispositions go to `B1b-core-repair.md`.
- Done. Seven things decided from eleven findings: six fixed in the two owned files, one (no closed event room locally) passed to the orchestrator. One export added beside `canPost`: `canPostAnswer` ("yes" / "no" / "failed"), waiting for the orchestrator's yes. Gates: typecheck 0, eslint on the two files 0, `npm test` 1374 pass. HTTP: the same 14 statuses as before the repair. No writes.
