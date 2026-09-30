# B0 notes (shared foundation), S69

Running log, newest at the bottom.

- Read contract sections 0, 1, 2, 3.10, 4-5 (card types), 6.0-6.3, 7, 8, 11, 12 and asis 8.1, 8.2, 9, 10.
- User's relayed answers (Sept 29): point 1 yes; point 2 agreed "but you shouldn't be able to see their messages still". Wave 1 only reserves `hidden` on ChatMessage, so nothing in B0 changes. Flagged for the orchestrator: the contract's one exception in 12.2 (an officer's top-level Board post shows to every member, blocked or not) may not match that sentence; Franky should confirm before the rooms' screens wave.
- flag.ts + flag.test.ts written; node --test green (the three list readers do not read the switch; chatV2For combines them; club ids filtered to uuid shape so a typo cannot fail the org_members read).
- schema.ts, room-state.ts + test written; room-state test green. Boundaries: start = live, end = live, end + 7d = closed (matches can_post_org_channel's now() < ends_at + 7 days). starts_at and ends_at take a string or a Date; only the clock may be epoch milliseconds.
- types.ts: first two parts written (6.0 shapes, refusal codes + sentences, cards, thread read).
- room-rules.ts + test written (28 tests green). Extras beyond the contract list: isRoomKind, isClubRole (guards for DB values), refusalBody(code) in types.ts. postRefusal fallback for cases the 6.2 table does not name = room_closed (officer refused on a Board top-level, Lounge/Officers/room refused, room gone).
- message-read.ts created by a mechanical move (script); moved block byte-identical apart from 'export'; route: imports fixed, rest identical.
- channel-access.ts type change (2 optional fields), rooms.ts stub, flag-server.ts, features route, .env.example block written.
- typecheck green.
- schema.ts sanity-checked with a one-off script (17 cases, the six codes + message fallbacks); no schema.test.ts because B0 owns no such file.

## Checks (final)
- `npm run typecheck`: green (tsc --noEmit, no output).
- `npm run lint`: FAILS repo-wide, 88 problems (32 errors, 56 warnings), none in a B0 file. `npx eslint` on the B0 files alone: clean. The files with problems are old and not B0's (public/html/_*.js, campus-home.tsx, MessagesMobile.tsx, CampusMobile.tsx, ProfileMobile.tsx, components/ui/*, ...).
- `npm test`: 1349 tests, 1348 pass, 1 fail. The failure is `src/lib/otto/parse-reminder.test.ts` (ERR_MODULE_NOT_FOUND: it imports "./parse-reminder" with no extension and no resolve hook); not a B0 file, last touched in 7746498. B0's own 58 tests (flag 15, room-state 15, room-rules 28) pass.

## Decisions B0 made where the contract is silent
1. `chatV2Everyone`, `chatV2ListedUser`, `chatV2ClubIds` each read one variable and do NOT look at the switch; `chatV2For` is the only full answer.
2. `chatV2ClubIds` leaves out entries that are not uuid-shaped (a handle or a star would fail the org_members read for every listed club).
3. `postRefusal` answers `room_closed` for every refusal the 6.2 table does not name (an owner/admin refused on a Board top-level, a Lounge / Officers / room refusal, room null with no root).
4. `clubRoomLabel`: a blank own name falls back to "Event chat" / "Room"; a blank club name leaves the room's part alone.
5. `roomState`: an event that ends before it starts, or any unreadable date or clock, is `closed`.
6. Extras not in the contract's list: `isRoomKind`, `isClubRole` (room-rules.ts), `refusalBody(code)`, `RefusalCode`, `PostRefusalCode`, `ChatRouteCode`, `ChatErrorCode`, `Refusal`, `FeaturesResponse`, `CreateCardResponse`, `VoteBody`, `VoteResponse`, `PollCardOption`, `MessageKind`, `RemovedInfo`, `ThreadRoom`, `RemoveMessageResponse`, `ThreadEntryRoomFields`, `InboxResponse`, `CalendarRoomFields`, `SpaceRoom` (types.ts). These only NAME shapes the contract writes inline; no field is renamed.
7. rooms.ts stub return types: loadRoom → Room | null; canPost → boolean; filterRoomReaders → string[]; clubRole → ClubRole | null. The contract gives the parameter lists only.

## For the orchestrator
- Not verified in a browser or by curl: the task forbids a dev server. `GET /api/me/features` is typechecked and linted only.
- Other batches' files seen changed in the tree while B0 ran (not touched by B0): scripts/local-seed.mjs, supabase/migrations/20261001100000_chat_v2_rooms.sql.

## Repair round 1 (running log)
- Read the 17 findings, contract sections 0, 2, 3.10, 6.0-6.2, 8, 11, 12 and every B0 file again. No caller outside src/lib/chat uses the flag readers, isMissingChatSchema, refusalBody or roomState yet, so the fixes below break nobody.
- Plan: fix in code = schema.ts (code wins over message), room-state.ts (zoned timestamps only), flag.ts (readers read the switch), flag-server.ts (two warn-once lines), types.ts (two comments, refusalBody fallback), room-state.test.ts header, .env.example (one sentence). No new file and no new exported name: schema.ts gets its tests inside flag.test.ts (same contract section, 2).
- schema.ts fixed: an error with a code is judged by the code alone; the message is read only when there is no code.
- room-state.ts fixed: strings are read by hand (zoned timestamps only, no Date.parse); room-state.test.ts header corrected, 4 tests added (19 green).
- flag.ts fixed: chatV2Everyone, chatV2ListedUser and chatV2ClubIds answer no while the switch is off (replaces decision 1 above). flag-server.ts: two warn-once lines (a star inside a list of people; a club entry that is not an id), values never logged.
- flag.test.ts: reader tests run with the switch on, one new test for the switch off, six tests for schema.ts added at the bottom (22 green).
- types.ts: doc comment on ThreadMessagesResponse (old database sends no room / viewer), `hidden` comment says both ways and what is not pinned yet, refusalBody falls back to the try_again sentence for a code with no sentence. room-rules.test.ts: 2 tests added. .env.example: the star must be the whole value.
- chatV2For checked with a scratch copy and a stubbed service client, 8 scenarios (switch off, star inside a list, "*,", lone star, bad club id, bad id beside a good one, a club listed twice, read error): answers and log lines as intended.
- Checks after the repair: typecheck green; eslint clean on B0 files (repo-wide lint still red, 88 problems, none B0's); npm test 1362 / 1361 pass, the 1 failure is src/lib/otto/parse-reminder.test.ts (not B0's). B0's 71 tests green in four time zones.
- Disposition list written to B0-repair.md. Decision 1 above is replaced: the list readers now read the switch.
- Still open for the orchestrator: a pure helper for chatV2For (new exported name), a Preview guard on the switch (changes the contract), the Board-post exception of 12.2 (Franky's question), the stub's shape for `hidden`.

## Repair round 2 (running log)
- 2 findings in, both "Gate failure" (repo-wide lint red, one red test). Re-ran all three commands on the tree as it stands.
- typecheck: exit 0. lint: exit 1, 88 problems (32 errors, 56 warnings) in 27 files, errors in 11 files, none B0's, none changed vs HEAD (git status on the 27 files is empty). eslint on the B0 files alone: exit 0.
- npm test: exit 1, 1362 tests, 1361 pass, 1 fail = src/lib/otto/parse-reminder.test.ts (ERR_MODULE_NOT_FOUND, extension-less import at line 17, Node v25.9.0). Tracked, unmodified, last changed in 7746498. B0's 71 tests alone: all green.
- Both findings are true as facts and both are REJECTED as B0 repairs: the only fixes live in files B0 does not own (the 11 component files or eslint.config.mjs; parse-reminder.test.ts or package.json's test script). No B0 file changed in round 2.
- Disposition list appended to B0-repair.md.

## Repair round 3 (running log)
- Same 2 findings as round 2 ("Gate failure" twice). Re-ran all three commands on the tree as it stands; nothing moved.
- typecheck: exit 0. lint: exit 1, 88 problems (32 errors, 56 warnings), 27 files with a problem, errors in the same 11 files; git status on those 11 files, eslint.config.mjs and package.json is empty (identical to HEAD). eslint on the 14 B0 files alone: exit 0.
- npm test: exit 1, 1362 tests, 1361 pass, 1 fail = src/lib/otto/parse-reminder.test.ts line 17, extension-less import, Node v25.9.0. B0's 71 tests alone: 71 pass.
- Both REJECTED again as B0 repairs: no file in B0's list is read by eslint's config or by that test, so no B0 edit can change either result. No B0 file changed in round 3.
- Checked Franky's relayed answer ("2. agreed but you shouldn't be able to see their messages still") against B0: types.ts only reserves `hidden` and already says the officer Board-post exception is not confirmed. Nothing in B0 encodes the exception. Still a contract question (12.2).
- Disposition list appended to B0-repair.md.
