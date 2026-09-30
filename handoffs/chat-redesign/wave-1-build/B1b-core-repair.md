# B1b-core repair, round 1 (Sept 29)

Files touched: `src/lib/chat/rooms.ts`, `src/lib/messages/channel-access.ts` (ensureMember only). Nothing else.

## Log

- Read contract 0, 1, 3.5, 3.10, 6.0, 6.2, 8, 14, 15, both files, the notes and the builder's harness. Eleven findings; four are repeats (1 = 7, 3 = 9, 6 = 10), so seven things to decide plus one for the orchestrator.
- Nothing imports `rooms.ts` yet (grep), so adding an export breaks nobody.
- Edited `rooms.ts`: `logFailureOnce` keyed by caller and cause (capped at 40 pairs); the uuid comment says the real reason; `loadRoom`'s comment states what null means; new export `canPostAnswer` ("yes" / "no" / "failed") with `canPost` folded from it, signature unchanged; a root that is not text answers no.
- Edited `channel-access.ts`: `readChannel` -> `readRow`, `channelRow` -> `found`. No behaviour change.
- Resumed (the first pass stopped after the edits, before the checks and the dispositions). Re-read the contract and both files; every edit listed above is in the tree. Next: check each finding against the code as it stands, run the gates, repeat the HTTP and direct-call cases.
- Gates on the tree as it stands: `npm run typecheck` exit 0; `npx eslint src/lib/chat/rooms.ts src/lib/messages/channel-access.ts` exit 0; `npm test` 1374 pass, 0 fail.
- Send gate re-proved (scratchpad `b1b-core-repair1/verify-gate.mjs`, 33 checks, all pass, reads only): real database through each person's own session (yes / no unchanged); a token PostgREST cannot read, an unreachable database, 57014, PGRST301, a blank code, a throw -> `canPostAnswer` "failed", `canPost` false; PGRST202 and 42883 -> "yes"; a null, false or text answer -> "no"; a root of 123, an array, an object, true, 0, false -> "no" without asking; blank and padded roots as before. Six different causes, each asked twice, gave six error lines and one warning.
- Reviewers' own scripts re-run on the repaired code (copies in scratchpad `b1b-core-repair1/`): `gate-failure.mjs` 15 failed gates, three causes -> 3 log lines (was 1); `stub-paths.mjs` -> loadRoom's second failure (42501 on events) and the missing service key are now logged, 9 lines in all (was 5). The builder's 84-check harness: 84 pass (its one log-count expectation changed from one error to one per cause).
- HTTP repeated with fresh sessions (`b1b-core-repair1/http.txt`), GET only: blake Lounge 200 (4), Board 200 (1), Game Night 200 (0), dm 200 (2), Officers / unknown / malformed 403; drew 403 on all seven; users/search 200 for both. Same 14 statuses as before the repair; bodies the same as before any wave-1 edit (key order aside).
- Two comment-only edits after the checks (`rooms.ts`): the null rule names the one other club row with no kind (`org_subchannel`, 0 rows anywhere, migration A stops on one); the root note no longer tells the route what to answer for a root that is not text, it only says this gate answers no. Gates run again after them: typecheck 0, eslint 0, `npm test` 1374 pass, `verify-gate.mjs` all pass.
- Log cap proved (`b1b-core-repair1/cap.mjs`, no database): 45 different causes -> 40 lines, the 40th says it is the last; a message that differs only after its 60th character is the same cause.

## Dispositions

Eleven findings, seven things (1 = 7, 3 = 9, 6 = 10), one of them not mine.

1. **A send gate that fails reads as a refusal; 503 `try_again` cannot be produced** (medium, twice: findings 1 and 7) — FIXED, and it NEEDS THE ORCHESTRATOR'S YES. `canPost` keeps its 14.4 signature and answers. One export was added beside it: `canPostAnswer(client, channelId, userId, rootId): Promise<"yes" | "no" | "failed">` (type `CanPostAnswer`). `canPost` is now `(await canPostAnswer(...)) === "yes"`. Finding 7 asked for the same thing under the name `askCanPost`; built once, as `canPostAnswer`. The name is not in contract section 8: if the answer is no, delete the export and strike the 503 sentence from 14.4. Nothing imports `rooms.ts` yet.
2. **"Logged once" is once per function, so a second, different failure is never logged** (low) — FIXED. The set is keyed by caller and the first 60 characters of the cause. One addition the finding did not ask for: the set stops at 40 pairs per instance and the 40th line says so, so causes that differ every time cannot fill memory or the log.
3. **`loadRoom` answers null for a failed read, a missing schema and a non-room alike** (low, twice: findings 3 and 9) — FIXED in words, no signature change, as both findings asked. The rule is in `loadRoom`'s comment and in the file header: `ensureMember` carried a `kind` and `loadRoom` answered null = the read failed, 503 `try_again`; `kind` null = the 3.10 defaults; `isOrgChannel` false = a dm or group. B4 has to apply it (request below).
4. **`canPost` rewrites a blank or padded root before asking** (low) — FIXED in words; the line is kept, as the finding asked (it agrees with `postRefusal`). The comment says the route cleans `thread_root_id` once and hands the same value to the gate, `postRefusal` and the insert. B4 has to do it (request below).
5. **Two new identifiers use a banned word** (low) — FIXED. `readChannel` -> `readRow`, `channelRow` -> `found`. `channel` and `channelErr` were there before wave 1; `ServerClient` and `channelId` in `rooms.ts` came with B0's committed stub.
6. **The reason given for the looser uuid check is not true** (low, twice: findings 6 and 10) — FIXED by the second option both findings allow: the pattern stays, the comment now says the real reason (its one job is to keep a value that fails the uuid cast away from the database; `ensureMember`, asked first, is stricter about the room's id). Not switched to `isUuid`: the ids checked here are mostly people, clubs, events and Board posts, and for those "does it name anything" is the database's answer. Say so if one rule in both files is wanted; it is a two-line change.
7. **`canPost` reads a root that is present but not text as "no root"** (low) — FIXED. A root that is not null, not undefined and not text answers no without asking (123, a list, an object, true, 0, false: all proved). A blank string is still no root.
8. **No closed event room locally** (low, for the orchestrator) — NOT MINE: `scripts/local-seed.mjs` is B1a's and this batch changes no data. The claim is true (read-only check: Chat Seed Callout is the only event past its 7 days and it has no room; the seven event rooms are all open). Passed on below.

## For B4 (the thread routes)

- Ask `canPostAnswer`, not `canPost`, if the orchestrator says yes to the name: "failed" -> 503 `try_again` and do NOT call `postRefusal`; "no" -> `postRefusal` picks the code; "yes" -> send.
- `ensureMember` carried a `kind` and `loadRoom` answered null -> 503 `try_again` in GET and POST. Never `room: null` with the 3.10 defaults for that case, never `postRefusal(null, ...)`.
- Clean `thread_root_id` once (trim; blank -> null) and hand the SAME value to the gate, to `postRefusal` and to the insert.
- `canPostAnswer`, `canPost` and `filterRoomReaders` are for club rooms only (`isOrgChannel` true): the database functions answer no / nobody for a dm or a group.

## For the orchestrator

- Say yes or no to the export `canPostAnswer` (contract 8 and 14.4).
- Finding 8: before the integration pass, one local-only data step so a closed event room exists (the reviewer's `update` on Chat Seed Cookout, or a seed event created after the triggers with `ends_at` 10 days ago), then read it over HTTP as the five accounts.

## Writes made

None. Every HTTP request was a GET and every script call a read; no `w1test` rows exist from this batch.
