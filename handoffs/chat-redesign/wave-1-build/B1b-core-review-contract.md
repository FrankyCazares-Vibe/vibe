# B1b-core review — lens: CONTRACT AND FALLBACKS

Reviewer, read-only. Files judged: `src/lib/chat/rooms.ts`, `src/lib/messages/channel-access.ts` (ensureMember only).

## Log

- Read contract 0, 1, 2, 3.5, 3.10, 6.0, 6.1, 6.2, 8, 14, 15; the builder's notes; the diff of channel-access.ts; rooms.ts whole; the B0 stub (git show HEAD:src/lib/chat/rooms.ts); schema.ts, types.ts, room-rules.ts.
- Signatures: the four in rooms.ts match 14.4 and the B0 stub word for word (checked by eye; typecheck to be run).

## Findings

(added one by one below)
- Gates re-run by me: `npx eslint src/lib/chat/rooms.ts src/lib/messages/channel-access.ts` exit 0; `npm run typecheck` exit 0 (npm test below).
- HTTP re-run by me (GET /api/me/threads/<id>/messages, dev server 3100): blake lounge 200, board 200, Game Night 200, dm c1fd3fec 200, Cookout 403, officers 403, unknown 403, malformed 403, non-RFC uuid 403; drew 403 on all nine. Same as the builder's table. No writes.
- Local database read: `channels.kind` and `event_id` readable by `authenticated`; `can_post_org_channel` executable by `authenticated`; `events.title / starts_at / ends_at` are NOT NULL; `channels.event_id` is ON DELETE CASCADE (an event room cannot outlive its event); no org channel with a null kind locally.
- `npm test`: 1374 pass, 0 fail.
- Real local PostgREST, reads only (scratchpad b1b-core-review-contract/real-errors.mjs): a missing column in a select answers 400 `42703`; a missing function, a wrong argument name or an omitted `root` all answer 404 `PGRST202`; a bad uuid answers `22P02`; a broken token answers 401 `PGRST301`; an unreachable database answers `code: ""`, message "TypeError: fetch failed". `isMissingChatSchema` reads the first two as missing and the rest as failures. So the 3.10 rows for `ensureMember` and the send gate are met by the real error shapes.
- rooms.ts failure paths against an in-process stub that answers like PostgREST (stub-paths.mjs): loadRoom / clubRole / filterRoomReaders never throw; every failure answers null / null / []. Log lines: see finding 2.
- filterRoomReaders on the real local database: 1 id 4 ms, 5 ids 4 ms, 20 ids 12 ms (one RPC per id, all at once). Not a finding locally.
- canPost through the service client answers by the `uid` given (true for blake in the Lounge), so wave 2 can pass either client.

### 1. MEDIUM — a send gate that FAILS reads as a send that was REFUSED; 14.4's 503 `try_again` cannot be produced

- File: `src/lib/chat/rooms.ts:175-187` (canPost), against contract 14.4 ("on any other RPC error it answers false and the route sends 503 `try_again`") and 6.0 (`try_again` = "Try again in a moment.").
- Evidence (scratchpad b1b-core-review-contract/gate-failure.mjs: the real `canPost` and the real `postRefusal`, a client whose RPC fails):
  - statement timeout `57014`, Lounge, member: `canPost=false` → the only code the route can pick is `room_closed` "This chat is closed."
  - same failure, Board, OWNER posting: `room_closed` "This chat is closed."
  - same failure, reply under a Board post: `board_post_missing` "That post is no longer there."
  - the same three answers for an expired token (`PGRST301`) and for a database that cannot be reached (`code: ""`, "TypeError: fetch failed").
- Why: `canPost` returns a bare boolean (the contract's own signature), so B4 cannot tell "the database said no" from "the database could not be asked". The builder followed the signature and reported the gap; it is still open and B4 builds on it next.
- Change (needs the orchestrator's yes, because it adds a name to section 8): keep `canPost` exactly as signed and add one export beside it in rooms.ts,
  `canPostAnswer(client, channelId, userId, rootId): Promise<"yes" | "no" | "failed">`
  ("yes" also for a missing schema; "failed" for any other RPC error or a throw; "no" only when the database answered and the answer was not true), with `canPost` becoming `(await canPostAnswer(...)) === "yes"`. B4 calls `canPostAnswer` and answers 503 `try_again` on "failed". Without that yes: strike the 503 sentence from 14.4 so the contract says what the code does.

### 2. LOW — "logged once" is once per FUNCTION per server instance, so a second, different failure is never logged

- File: `src/lib/chat/rooms.ts:44-51` (`logFailureOnce(tag, …)`, the key is the tag alone), used at :64, :70, :101, :124, :138, :180, :185, :222, :227, :261, :267.
- Evidence (stub-paths.mjs): loadRoom failed first with `57014` (logged), then the events read failed with `42501 permission denied` (NOT logged), then the service key was removed (NOT logged: the tag was used up). gate-failure.mjs: 15 failed gates with three different causes, 1 log line, the first cause only.
- Why it matters here and not in flag-server.ts: a failed `canPost` stops people from posting and a failed `filterRoomReaders` drops mentions; after the first line the log says nothing about either for the life of the instance, and a missing service key can hide behind an earlier timeout.
- Change: key the set by tag and cause: `const key = tag + "|" + (code || what)`, e.g. `logFailureOnce(tag, errorSummary(error))` → inside, `const key = `${tag}|${what.slice(0, 60)}``. Still one line per cause per instance.

### 3. LOW — loadRoom answers null for three different states, and the caller is not told how to tell them apart

- File: `src/lib/chat/rooms.ts:99-103`, `:123-127`, `:137-140` (a failed read → null), next to `:104-107` (no such room / a dm → null) and `:100` (missing schema → null).
- Evidence (stub-paths.mjs): channels read `57014` → null; event room whose events read fails → null; `42703` → null; a dm → null. Four causes, one answer.
- Consequence for B4 on a MIGRATED database during a hiccup: the thread GET would answer `room: null` with the 3.10 defaults (`viewer.can_post: true`, `role: null`), so a member sees a composer on the Board, and `postRefusal(null, …)` picks `room_closed` for whatever the database then refuses.
- Change (no new name needed): say in loadRoom's comment, and in the note handed to B4, the rule that separates them: `ensureMember` answered `kind` not null AND `loadRoom` answered null = the read failed → the route answers 503 `try_again`; `kind` null = a database without the columns → the 3.10 defaults.

### 4. LOW — a blank or padded `rootId` is rewritten inside canPost

- File: `src/lib/chat/rooms.ts:166`.
- Evidence (timing.mjs, real local database, blake's session): `canPost(LOUNGE, "")` → true; `canPost(BOARD, "  587408ab-…  ")` → true. The function's own rule two lines lower is "an id that is not a uuid answers false".
- Consequence: the gate can say yes to a body the insert cannot store as sent (`""` or a padded id is not a uuid → 22P02 → the bare 500 of 6.2). It agrees with `postRefusal` (B0), which also reads a blank root as no root, so this only bites if B4 stores the body's value instead of the cleaned one.
- Change: keep the line, and add to the comment at :155 and to B4's note: "the route cleans `thread_root_id` once (trim; blank → null) and passes the SAME value to canPost, postRefusal and the insert".

### 5. LOW — two new identifiers carry the word the contract bans from new identifiers

- File: `src/lib/messages/channel-access.ts:70` (`readChannel`), `:77` (`channelRow`). Contract section 1: "Never in copy or new identifiers: channel, server, thread (user-facing), #. Existing identifiers … keep their names."
- Change: `readChannel` → `readRow`, `channelRow` → `row` is taken lower down, so `found`; or the orchestrator rules that locals inside the old gate are exempt.

### 6. LOW — the reason given for the second uuid check is not true here

- File: `src/lib/chat/rooms.ts:33-34` ("Looser than `isUuid` (pgrest.ts), which refuses the local seed's ids").
- Evidence (local database): ids that fail the strict check: channels 0 of 30, users 0 of 7, orgs 0 of 7, events 0 of 8, messages 0 of 10. `ensureMember` (`channel-access.ts:59`) still uses the strict `isUuid`, so an id the loose check lets through is refused with 403 one step earlier anyway.
- Change: import `isUuid` from `@/lib/pgrest` and drop `UUID_SHAPE` / `isId`'s regex, or keep the loose check and correct the comment to the real reason.

## Not findings (checked, for the record of what was covered)

- Signatures and return types: equal to 14.4 and to the B0 stub.
- Service role / cookie client: loadRoom, filterRoomReaders, clubRole create the service client; canPost uses only the client it is given; ensureMember uses only the client it is given.
- ensureMember diff: the dm / group branch is untouched; the club variant gains two keys; statuses identical over HTTP for 18 cases.

## Writes made

None to the database (every request was a GET or a read RPC). Files: this notes file, and scripts in the scratchpad folder b1b-core-review-contract.
