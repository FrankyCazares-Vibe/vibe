# B0 repair, round 1 (S69, 2026-09-29)

17 findings in. 8 fixed in code or comments, 1 fixed in part, 8 with no change in a B0 file (6 of them are notes for the orchestrator or for Franky). No new file, no new exported name, no contract name changed. Files changed in this round: `src/lib/chat/schema.ts`, `room-state.ts`, `room-state.test.ts`, `flag.ts`, `flag.test.ts`, `flag-server.ts`, `types.ts`, `room-rules.test.ts`, `.env.example`. Not touched in this round: `message-read.ts`, `rooms.ts`, `room-rules.ts`, the features route, `channel-access.ts`, `messages/route.ts`.

## Dispositions

| # | finding | result | why |
|---|---|---|---|
| 1 | Thread read type marks `room`, `viewer` and the new message fields as always present | FIXED (comment) | Real: 6.1 pins the fields, 3.10 and 10.1 say an old database sends none. Doc comment added on `ThreadMessagesResponse`; no field changed. B4 and B5 prompts must say it too. |
| 2 | `hidden` comment names one direction only | FIXED (comment) | Now says both ways, stub with no content, author or card, always false in wave 1, and lists what is not pinned (the stub's shape, the Board-post exception). |
| 3 | `readChatMessages` / `readChatMessage` are not in message-read.ts | NO CHANGE | Real gap in the contract's wording, not in B0: 6.1 has B0 move four pieces and B4 add the rest. B4's prompt must name the two functions. |
| 4 | A malformed club id in `CHAT_V2_CLUBS` is dropped silently | FIXED | flag-server.ts warns once per server instance, without the value. Counts entries that are not id-shaped (not "entries minus ids", which would warn on a club listed twice). |
| 5 | Exported names the contract does not pin | NO CHANGE | Real, by design (B0 notes, decision 6). List goes to B1b, B4, B5; B4 keeps `AttachmentRow` and `ParentPreview` exported; everyone imports `RoomState` from types.ts. |
| 6 | `outranks` is stricter than 6.3 at rank 0 | REJECTED | Kept: a member removing a member's message is never right, and 6.3 runs the `ROOM_MODERATOR_ROLES` check first, so no route answer changes. |
| 7 | Test header says room-state.ts has no imports | FIXED | Header corrected (type-only import, erased). |
| 8 | Contract 12.2's officer Board-post exception against Franky's sentence | NO CHANGE in B0 | Real, a contract question. No B0 file encodes either reading. Reported under contract problems; one question for Franky before the screens wave. |
| 9 | Line references to the two edited files are off | NO CHANGE | Real. One line for B4's and B1b's prompts: messages/route.ts is 162 lines shorter after line 42; moved pieces at message-read.ts:31-188; channel-access.ts +5 after the type. |
| 10 | `isMissingChatSchema` trusts the message when the code is different | FIXED | An error with a non-blank code is judged by the code alone; the message is read only with no code. Regression test added (the 22P02 echo and six more). |
| 11 | `roomState` reads lenient strings and zone-less strings | FIXED | Strings are read by hand: zoned timestamps only, no `Date.parse`. "12", "2026", "Fall Formal 2026", a zone-less string, Feb 30, hour 24 all answer `closed`. Tests pass in four time zones. |
| 12 | No committed test for `isMissingChatSchema` or `chatV2For` | FIXED IN PART | schema.ts now has six committed tests, inside flag.test.ts (same contract section, no new file). The pure helper for `chatV2For` is a new exported name: not added, waits for the orchestrator. `chatV2For` checked with a scratch copy and a stubbed client (8 scenarios). |
| 13 | The three list readers answer without the switch | FIXED | Each reader returns false / false / [] while the switch is off. The test that could not fail is joined by one that asserts all three readers under seven off values. |
| 14 | A star inside a list is silently nobody | FIXED (first option) | Behaviour kept (fails closed). .env.example says the star must be the whole value, and flag-server.ts warns once when a star sits inside a list. |
| 15 | `refusalBody` can send a refusal with no sentence | FIXED | A code with no sentence of its own gets "Try again in a moment." and keeps its code. `hasOwnProperty` rather than `Object.hasOwn`: types.ts is loaded by screens too. |
| 16 | Nothing refuses the flag on Vercel Preview | NOT CHANGED | Real gap, but the fix changes what the contract says `CHAT_V2_ENABLED` means. Needs the orchestrator's yes. Reported under contract problems. |
| 17 | Contract 12.2's exception (same as 8) | NO CHANGE in B0 | Same as 8. |

## Checks after the repair

- `npm run typecheck`: green.
- `npm run lint`: red repo-wide, 88 problems (32 errors, 56 warnings) in 47 files, the same count as before the repair; none in a B0 file. `npx eslint` on the B0 files: clean.
- `npm test`: 1362 tests, 1361 pass, 1 fail. The failure is `src/lib/otto/parse-reminder.test.ts` (ERR_MODULE_NOT_FOUND), not a B0 file, last changed in 7746498. B0's own tests: 71 (flag + schema 22, room-state 19, room-rules 30), all green, also with TZ set to Indianapolis, UTC, Kolkata and Kiritimati.

## Behaviour that changed for other batches

1. `chatV2Everyone`, `chatV2ListedUser`, `chatV2ClubIds` answer no while `CHAT_V2_ENABLED` is off.
2. `isMissingChatSchema` answers false for any error that carries a code outside the six, whatever its message says.
3. `roomState` answers `closed` for a date string without a time zone. Every caller must pass the timestamptz string as the database sent it, or a Date.
4. `refusalBody` never returns a body without `error`.

---

# B0 repair, round 2 (S69, 2026-09-29)

2 findings in, both titled "Gate failure". Both are true as facts and neither can be fixed from a B0 file. No B0 file changed in this round; only this file and B0-notes.md were appended to.

## Dispositions

| # | finding | result | why |
|---|---|---|---|
| 1 | Gate failure: `npm run lint` exits 1 (88 problems, 32 errors, 56 warnings) | REJECTED (not B0's to fix) | Checked again: the 32 errors sit in 11 old files under src/components/mobile, src/components/the-map and src/components/ui, all tracked and unchanged vs HEAD, none in the B0 list and none another batch is editing. `npx eslint` on the B0 files alone exits 0. The only ways to turn the command green are to edit those 11 files or to loosen eslint.config.mjs, and B0 owns neither. |
| 2 | Gate failure: `npm test` exits 1 (1362 tests, 1361 pass, 1 fail) | REJECTED (not B0's to fix) | Checked again: the one failure is src/lib/otto/parse-reminder.test.ts, ERR_MODULE_NOT_FOUND on its extension-less import of "./parse-reminder" (line 17) under Node v25.9.0. Tracked, unchanged, last touched in 7746498 (May 11). B0's own 71 tests pass. The fix is one line in that test file (import "./parse-reminder.ts") or a change to the test script in package.json; B0 owns neither. |

## Checks in round 2

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 1, 88 problems (32 errors, 56 warnings), the same count as in round 1 and in the gate; none in a B0 file. `npx eslint` on the B0 files: exit 0, no output.
- `npm test`: exit 1, 1362 tests, 1361 pass, 1 fail (src/lib/otto/parse-reminder.test.ts). B0's tests alone (flag + schema, room-state, room-rules): 71 of 71 pass.

## What the orchestrator has to decide

1. The gate rule as written cannot pass on this branch for any batch, because both red results come from files that are byte-identical to HEAD (not re-run on a clean checkout: B0 may not switch or stash). Two ways out: judge each batch on "no new problem in the batch's own files" (eslint on the owned files, the batch's own tests, plus repo-wide typecheck), or fix the baseline in a separate, owned change first.
2. Baseline fix, if wanted, is small: the test needs the `.ts` extension on one import; the lint errors are 32 in 11 files (3 auto-fixable), most in decorative src/components/ui files.

---

# B0 repair, round 3 (S69, 2026-09-29)

The same 2 findings as round 2, word for word. Both checked again from scratch; both are true as facts and neither can be fixed from a B0 file. No B0 file changed in this round; only this file and B0-notes.md were appended to.

## Dispositions

| # | finding | result | why |
|---|---|---|---|
| 1 | Gate failure: `npm run lint` exits 1 (88 problems, 32 errors, 56 warnings) | REJECTED (not B0's to fix) | Same 32 errors in the same 11 files (src/components/mobile x3, the-map x1, ui x7), all identical to HEAD. `npx eslint` on the 14 B0 files exits 0. `npm run lint` is plain `eslint` over the repo; only an edit to those 11 files or to eslint.config.mjs / package.json changes its exit code, and B0 owns none of them. |
| 2 | Gate failure: `npm test` exits 1 (1362 tests, 1361 pass, 1 fail) | REJECTED (not B0's to fix) | The one failure is src/lib/otto/parse-reminder.test.ts line 17 (`from "./parse-reminder"`, no extension, Node v25.9.0), identical to HEAD, last changed in 7746498 (May 11). B0's 71 tests pass. Only that test file or package.json's test script can fix it; B0 owns neither. |

## Checks in round 3

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 1, 88 problems (32 errors, 56 warnings); none in a B0 file. `npx eslint` on the B0 files: exit 0, no output.
- `npm test`: exit 1, 1362 tests, 1361 pass, 1 fail (src/lib/otto/parse-reminder.test.ts). B0's tests alone: 71 of 71 pass.

## For the orchestrator

1. A round 4 with the same two findings will end the same way. The loop stops only with one of: (a) judge a batch on its own files (eslint on the owned files, its own tests, repo-wide typecheck), or (b) fix the baseline in its own owned change first: one import in parse-reminder.test.ts (`"./parse-reminder.ts"`) and 32 lint errors in 11 component files (3 auto-fixable).
2. Franky's relayed answer on point 2 ("agreed but you shouldn't be able to see their messages still") reads against the officer Board-post exception in contract 12.2. B0 encodes neither reading (`hidden` is only reserved, always false in wave 1). The contract needs his yes or no on the exception before the screens wave.
