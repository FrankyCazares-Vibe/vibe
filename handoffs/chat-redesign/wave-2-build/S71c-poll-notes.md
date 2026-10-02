# S71c — batch POLL notes (amendment 3, sections C + D)

Started 2026-10-01. Owner files: `src/lib/chat/use-room-poll.ts`, `src/lib/chat/page-merge.ts`, their tests, `src/components/mobile/messages/club/RoomChips.tsx`.

## Log

- Read the amendment (S71-amendment-3.md) fully. Reading the owned files next.
- Read `use-room-poll.ts` (459 lines), `page-merge.ts` (63), `page-merge.test.ts` (10 tests), `RoomChips.tsx`, contract 9.3 / 11.3 / 11.4 / 11.5, the audit's F05 and F08, and how `ClubSpace` / `EventChat` call the hook (read only, not edited).
- Fact: the hook has NO test file of its own today (it imports React and `@/` paths, which `node --test` cannot load). "The hook's existing tests" = `page-merge.test.ts`.

## Plan

- **D (F08)** in `page-merge.ts`: `pageLeavesGap(state, page, pageLimit)` + `applyFullPage(state, page, pageLimit)` -> `{ messages, gap }`. Gap -> the page, then the `temp_` rows at the end; no gap -> `mergeFullPage` as today. The hook sets `hasEarlier` true on a gap.
- **C (F05)** the decision is a pure function in `page-merge.ts` (the only pure file this batch owns; no new file): `arrivedFromOthers(rows, viewerId)` and `markReadDecision({ arrived, owed, visible })` -> `{ mark, owed }`. The hook keeps one ref, "a mark is owed".
- `RoomChips.tsx`: the active chip never draws the dot, and its `aria-label` does not say "1 unread post" either.

## Done so far

- `page-merge.ts`: added `pageLeavesGap`, `applyFullPage`, `arrivedFromOthers`, `markReadDecision` (pure; `mergeFullPage` untouched).
- `use-room-poll.ts`: `readFull` uses `applyFullPage` (gap -> replace, `hasEarlier` true); `readAfter` and `readFull` end with one `settleMark(id, arrived)`; the mount's mark goes through the same decision; the cleanup sends an owed mark when the page is visible. Header comment rewritten for both rules.
- `RoomChips.tsx`: the active chip draws no dot and its `aria-label` drops "1 unread post".
- `page-merge.test.ts`: 11 gap / no-gap tests added (21 pass so far); the mark-read tests come next.
- `use-room-poll.test.ts` (new, 7 tests): reads the hook's source and holds it to the two pure decisions (the repo's style, as `group-rules.test.ts` does for its routes), because the hook itself cannot be loaded by `node --test`.
- `page-merge.test.ts`: 19 tests added in all (11 gap / no-gap, 8 mark-read), 29 pass.

## What was built, in plain words

**C (F05) — what you watched arrive is read.**
- A 4-second quick check that adds at least one message by someone else marks the room read, once for that check. My own message coming back does not.
- Nothing is ever marked while the page is hidden. If a message lands then (or the room was opened in a hidden tab), the mark is "owed": it goes out with the first check that answers once the page is visible again, or when I leave the room (Back, another chip, the event chat opening on top) if the page is visible at that moment.
- The Board chip (or any chip) of the room I am on never draws the unread dot, and its screen-reader label no longer says "1 unread post".
- Server untouched. Same `POST /api/me/threads/<id>/read`, same quiet error handling.

**D (F08) — no silent skip after a locked phone.**
- When a full read brings a FULL page (50) whose oldest message is newer than the newest message on screen, the list on screen is replaced by that page (my unsent messages stay at the end) and "Earlier messages" appears, so paging back walks through the missed messages.
- Otherwise (the page overlaps what is on screen, or it is not full) it merges exactly as before.

## Readings of the contract I had to choose (say if any is wrong)

1. **"Touches" = the page contains or ties the newest row on screen.** A full page whose oldest row is the very next message after the newest on screen is treated as a gap (the client cannot know nothing lies between). This is the literal rule ("oldest is newer than the newest on screen and the page is full"). Test: `GAP: the next row after the newest on screen…`.
2. **No server row on screen + a full page is also a gap** (hasEarlier turns true). The amendment's sentence does not cover an on-screen list with no server rows (an empty room that got 50+ messages between two reads); without this the rows before the page would be unreachable. On the very first read this equals today's `hasEarlier = page is full`.
3. **"Never mark while hidden" is applied to every mark the hook sends**, including the two that existed before: the mount's mark and the mark after a full read that brought rows. Hidden -> owed, sent when visible again. In a visible page these two behave exactly as before.
4. **The pure decision lives in `page-merge.ts`**, not a new file: it is the only pure file this batch owns.
5. After a gap replace the room is still marked read (the full read "brought new rows", today's rule): the rows in the gap count as read although they were not on screen. Same as today's behaviour for a merge; not changed.

## Requests for NAV / the orchestrator (not edited by me)

- **Contract 11.5, the mark-read sentence**, to fold into 17.10: "Mark-read: on mount; after a later full read that brought new rows; after a 4-s `?after=` read that appended at least one row by someone else; on the hook's cleanup / `enabled` false when a mark is owed. Never while the page is hidden (then it is owed until a read answers while visible). At most one mark per read."
- **Contract 9.3**, add: "a FULL page whose oldest row is newer than the newest non-`temp_` row on screen replaces the list (`applyFullPage`), `temp_` rows kept at the end, `hasEarlier` true."
- **`ClubSpace.tsx` (NAV's file), small leftover of F05:** the space read is up to 20 s old. If a Board post arrives while I am on the Board and I then tap the Lounge chip, the Board chip and the Board strip can show the dot until the next space read (up to 20 s), although the room was marked read. A space re-read when the picked room changes would close it. Not done here (not my file).
- **`RoomThread.tsx` (NAV's file):** after a gap replace the list is swapped whole (the old rows leave, the newest 50 arrive). The pin-to-newest rule of section E should treat it like any new rows.
- A tiny race stays (the audit accepted it): the last tick's mark may still be in flight when Back makes the home re-read the inbox; the row can say "1 new" until the home's next read.

## Could not do

- No browser, no server (rule G). Nothing here was seen running; the hook's behaviour is proven only through the pure decisions and the source-wiring tests.

## Files changed (worktree only, nothing committed)

- `src/lib/chat/page-merge.ts` (+84)
- `src/lib/chat/use-room-poll.ts` (+81 / -20 with comments)
- `src/lib/chat/page-merge.test.ts` (+19 tests)
- `src/lib/chat/use-room-poll.test.ts` (NEW, 7 tests)
- `src/components/mobile/messages/club/RoomChips.tsx` (+9 / -2: the dot and the label)

Flag-OFF: all five are reached only from the `chat_v2` screens (`ClubSpace`, `EventChat`, `RoomThread`, `BoardView`); nothing a flag-OFF user reaches changed.

## Gates (run 2026-10-01, before NAV had changed any `src` file)

- `npx tsc --noEmit` -> exit 0
- `npx eslint` on the 5 changed files -> exit 0, no output
- `npm test` -> 1,762 tests, 1,762 pass, 0 fail (baseline 1,736; +26 = 19 + 7)

## For the hand walk (POLL part)

1. Two accounts in one club Lounge. A sends 6 messages while B watches. B taps Back: the club row shows no "N new".
2. B on the Board, A (officer) posts. Within 20 s the Board chip B is on shows NO dot. Network tab: one `POST …/read` per 4-s check that brought A's rows, none on quiet checks.
3. B switches tab (page hidden), A sends 2, B returns: one `POST …/read` after the return's read, none while hidden.
4. B's room open, lock / hide the page, A sends 60+ messages, B returns: the thread shows the newest 50, "Earlier messages" is there, tapping it walks back through the missed ones with none skipped.
