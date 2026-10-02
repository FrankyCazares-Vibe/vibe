# S71c repair notes (amendment 3: review findings)

Started 2026-10-01. Repair agent. Worktree only; no commit, no server, no browser.

Findings to handle (6):
1. POLL-1 gap test fooled by my own sent row (medium)
2. POLL-2 quick-check cursor skips rows that landed before my send (medium)
3. POLL-3 late answer after a gap replace leaves a hole (medium)
4. NAV-1 Chrome may skip entries after back-then-push (high, PLAUSIBLE)
5. NAV-2 Back again while a restored room is loading opens the room on the home entry (medium)
6. NAV-3 Back from a link out re-opens the EVENT chat (medium)

## Progress log
- POLL-1 (gap test fooled by my own sent row): REAL. FIXED. `RoomState.readFrontier` (the newest `created_at` a READ delivered; in the room-tagged state rather than a bare ref so a room change resets it for free). `pageLeavesGap(frontier, page, limit)` reads the frontier, not the list. `applyFullPage(state, page, limit, frontier)` returns `{ messages, gap, frontier }`. On a gap it also keeps my sends that are newer than the page's newest (reviewer case c: the page was taken before my row existed; without this my just-sent message would vanish for up to 4 s). After any full read the frontier = the page's newest row (it can move BACK: a late page's merge drops newer rows by 9.3, the next `?after=` brings them back).
- POLL-2 (quick checks skip a row that landed just before my send): REAL (pre-existing at HEAD). FIXED, same frontier: the tick's cursor is `cur.readFrontier`; `cursorOf` is gone. New pure `applyAfterRows`.
- POLL-3 (late answer after a gap replace): REAL. FIXED. `epochRef` bumped in `readFull` on a gap replace of an existing list; `readAfter` and `loadEarlier` capture it before the await and drop the answer if it changed. Also: `readAfter` drops an answer whose cursor is past the frontier (`afterAnswerJoins`), `loadEarlier` drops an answer when the list's oldest row is no longer the one it asked before. `refreshOne` NOT given the epoch check on purpose: it only swaps a row already in the list by id (it cannot add a row, so it cannot make a hole), and dropping it could leave an RSVP card one full read (20 s) stale.
- Tests: page-merge.test.ts 38 (was 26 in D/C sections + base), use-room-poll.test.ts 10 (was 7). tsc exit 0 after POLL.
- For the orchestrator: contract 17.10 D sentence should read "newer than the newest row a READ brought (the read frontier)" instead of "the NEWEST non-temp_ row on screen"; I did not edit the contract file.
- NAV-2 (Back again while a restored room is loading): REAL (read in MessagesMobile.tsx onPop: the nothing-open branch returned without bumping `deepLinkSeqRef` when the entry named no room). FIXED in `MessagesMobile.tsx` (V2 only): the nothing-open branch bumps the seq first; `openFromEntry` has one guard `stillMine()` (seq + this page + the LIVE entry still names this id) used after the read and inside both `clearLayersThen` writes.
- NAV-3 (Back from a link out re-opens the EVENT chat): REAL (the depth-1 entry of a space entered by a week card / event deep link keeps the event id; `arrivalWrites` answers "space+layer" for it). FIXED with the reviewer's first option: `ClubSpace` onPop rewrites the space's entry to the room on screen when the event chat closes onto an entry that names the layer (`spaceEntryAfterLayer` / `spaceEntryNamesLayer`, pure, in layer-stack.ts). If the space has not answered yet (no room to name), the id is remembered (`staleEntryRef`) and written by an effect once the room is known, only while that entry is still the live one. Tests still to add in layer-stack.test.ts (next step).
- NAV-1 next: mechanism confirmed against Chromium's own doc (fetched): "same-document back/forwards ... the intervention stops honoring such activations for creating new entries until a new activation is received", "When a document adds a history entry without having a user activation, [skip] for all same-document history entries will be set to true", "When a document receives a user gesture ... set to false", "only impacts the browser back/forward buttons and not the history.back()/forward() APIs". NOT browser-tested (rule G). Plan: (1) a layer closed in the same commit another opens hands its entry over (no step back, no push; also covers React's dev double mount); (2) the posting guard goes FORWARD onto the entry Back left (no new entry); (3) tray -> event chip: the tray's entry becomes the event chat's by replaceState.
- NAV-1 built in `layer-stack.ts` (+ `clearLayersInto` in use-layer-history.ts, `ClubSpace.openEvent`): (1) `close()` no longer steps back at once: the entry is an "orphan" until the end of the tick (`env.later`); an `open()` in that tick takes it over (tray -> Poll / Sign-up / Share event: no go(-1), no push; same for React's dev double mount). (2) posting guard: `traverse(+k)` forward onto the entry Back left, not a re-push. (3) `clearInto(write)`: tray open -> event chip: the tray's entry becomes the event chat's by replaceState. (4) the fourth path (push after a restore) is gone with NAV-3. layer-stack.test.ts: 40 tests (was 26); the fake browser now models Chrome's rule (`tap()`, `trapped()`).
- NAV-1 status: built from the documented mechanism, NOT seen in a browser. Contract A says "(re-push the entry, as the audit suggests)" for the posting guard: the repair steps FORWARD instead (same result on screen, no new entry). Flagged for the orchestrator.

## Result per finding

1. POLL-1 (gap test fooled by my own sent message) — REAL, FIXED. The gap test and the 4-s cursor read a "read frontier" (the newest row a READ delivered), kept in the hook's room state as `readFrontier`. `append` / `replace` / `remove` never write it (held by a wiring test).
2. POLL-2 (a message that landed just before my send shows up to 20 s late) — REAL (already at HEAD), FIXED with the same frontier (`cursorOf` removed; the tick asks `?after=<readFrontier>`).
3. POLL-3 (a late answer after a gap replace leaves a hole) — REAL, FIXED. `epochRef` bumped on a gap replace; `readAfter` and `loadEarlier` drop an answer asked before it. Two extra guards found while fixing: `readAfter` also drops an answer whose cursor is past the frontier; `loadEarlier` also drops when the list's oldest row changed while it was out. `refreshOne` left alone on purpose (it swaps a row by id, cannot add one; dropping it could leave an RSVP card 20 s stale). One reviewer suggestion not taken, said here so it can be overruled.
4. NAV-1 (Chrome may skip the space and home entries) — PLAUSIBLE, mechanism confirmed in Chromium's doc, NOT seen in a browser (rule G). FIXED BY DESIGN for all four paths: tray -> sheet hands the entry over; the posting guard steps forward instead of re-pushing; tray -> event chip replaces the tray's entry; the push after a restore is gone with NAV-3. Still to confirm by hand with the REAL Back button (walk steps R1-R4).
5. NAV-2 (Back again while a restored room loads) — REAL, FIXED (`MessagesMobile.tsx` V2: the nothing-open pop bumps the seq; `stillMine()` also checks the live entry names the room). Model scenarios 27 and 28 now end on the home with the home entry intact.
6. NAV-3 (Back from a link out re-opens the event chat) — REAL, FIXED (the space's entry is rewritten to the room on screen when the event chat closes). Model scenario 17: club page -> Back = the space on its Lounge, no event chat, no new entry.

## What changed in behaviour beyond the findings' letter (each can be taken back)

- On a gap replace, my own sends that are newer than the page are kept at the end with the unsent rows (otherwise my just-sent message would vanish for up to 4 s).
- After a full read the frontier is the page's newest row, so it can move BACK (a page that answered late); the next quick check brings back what the merge dropped.
- After the event chat closes, the address of a space that was entered through an event becomes `?channel=<lounge>` (before: it stayed `?channel=<event>`).
- A sheet closed by its own control steps back at the end of the tick (setTimeout 0), not synchronously.
- Posting guard: contract A's parenthesis says "re-push the entry"; the repair steps forward onto the same entry instead. Same on screen; no new history entry.

## For the contract (not edited by me)

- 17.10 D: "…a full page's OLDEST row is newer than the newest row a READ brought (the read frontier; my own sent message on screen does not count)…".
- 9.3: the 4-s cursor is the read frontier, not the newest row on screen.
- 17.10 A: "while posting, Back is answered by a step forward onto the sheet's entry (no new entry)"; "a layer that replaces another in the same commit keeps its entry"; "the event chat opened with the tray up takes the tray's entry".

## Still open (not in this repair)

- A fresh deep link to an event chat (or `?to=`) pushes an entry with no tap on the page at all: by the same Chrome rule the browser's Back skips this page's entries until the first tap. Present before amendment 3 (2.3's deep-link design); nothing can add an unskippable entry without a tap.
- `mergeFullPage` (9.3, unchanged) drops my just-sent row when a full read that was taken before it answers after the POST: it comes back with the next quick check (up to 4 s). Present at HEAD.
- The reviewers' low items (temp_ row order after a sorted merge; the Board dot after leaving the Board) were not in my list.

## Files changed by the repair

- `src/lib/chat/page-merge.ts`, `src/lib/chat/page-merge.test.ts`
- `src/lib/chat/use-room-poll.ts`, `src/lib/chat/use-room-poll.test.ts`
- `src/lib/chat/layer-stack.ts`, `src/lib/chat/layer-stack.test.ts`
- `src/lib/chat/use-layer-history.ts`
- `src/components/mobile/MessagesMobile.tsx` (V2 only; V1, the fork and FlagPending byte-identical to HEAD, checked with diff)
- `src/components/mobile/messages/club/ClubSpace.tsx`
- `src/components/mobile/messages/compose/CardSheet.tsx` (comment only)

## Gates (2026-10-01, after the repair)

- `npx tsc --noEmit` -> exit 0
- `npm test` -> 1,814 tests, 1,814 pass, 0 fail (baseline 1,736; 1,788 before the repair; log: scratchpad/s71c/repair-npm-test.log)
- `npx eslint` on the 17 changed .ts/.tsx files -> 2 errors, both the legacy ones in `MessagesMobileV1` (now at :672 `react-hooks/immutability` and :725 `react-hooks/set-state-in-effect`); 0 new
- The reviewer's history model re-run with the repair transliterated (scratchpad/s71c/navsim-repair): run1 identical to its baseline; run2 identical except 10d (tray -> Poll then Back at once now closes only the sheet; before it fell to the home); run3 changes only scenario 17 (fixed); run4 scenarios 27 / 28 fixed.

## Could not do

- No browser, no server, no device. NAV-1 especially is built from Chromium's written rule and a model of it in the tests, not from a real Back press.

## Final walk list for the orchestrator

375px, flag ON (blake = member, avery = owner), hard reload first. `S = () => { const s = history.state; return { vibeChat: s?.vibeChat, depth: s?.depth, sheet: s?.sheet } }`. The NAV builder's steps 1-35 (S71c-nav-notes.md) and POLL's 1-4 (S71c-poll-notes.md) still stand, with these changes:

- NAV step 1/2: opening a sheet in `next dev` no longer does push / back / push (the second mount takes the first one's entry). "+" -> Poll: `history.length` must NOT grow between the tray and the sheet, `S().sheet === 1`.
- NAV step 3: after the X or the scrim, `S().sheet` is undefined one tick later (check after ~50 ms), then ONE Back -> the home.
- NAV step 5 (posting guard): `history.back()` while `Posting…` -> the sheet stays, `S().sheet === 1` again within ~50 ms, `history.length` unchanged (no new entry), the poll posts once.
- NAV step 12: tray open -> event chip: the event chat, `S()` = `{ event id, 2, undefined }`, `history.length` unchanged from the tray being open; Back -> the Lounge with the tray closed; Back -> the home.

New, the repair (R = REAL Back: the toolbar Back button in desktop Chrome, or Android's system Back in Chrome / the installed PWA; NOT `history.back()` in the console, and do not tap the page between the action and Back):

- R1. Lounge -> "+" -> Poll, then REAL Back at once without touching the sheet. Expected: only the sheet closes, the Lounge is still there. REAL Back again -> the home. REAL Back again -> the page before Messages.
- R2. Lounge -> "+" (tray) -> an event chip, then REAL Back at once. Expected: the Lounge (tray closed). REAL Back -> the home.
- R3. Slow `/cards` by 3 s, tap `Post poll`, REAL Back twice while it says `Posting…`. Expected: the sheet stays both times; after the post the sheet closes; then REAL Back (no tap in between) -> the home, not past it.
- R4. Any sheet in `next dev` (StrictMode): open it with one tap, REAL Back at once. Expected: only the sheet closes.
- R5 (NAV-2). Throttle the network (Slow 3G). Lounge -> the club page -> Back, and Back AGAIN while the home shows and the room is still loading. Expected: the home stays, address `/messages`, `S()` all undefined; nothing opens a second later. Back once more -> the page before Messages. Also: home -> club -> header Back -> Forward -> Back at once: the home, nothing opens.
- R6 (NAV-3). Home -> a Your-week event card (event chat opens) -> Back. Expected: the space on its Lounge, address `?channel=<lounge id>` (not the event's), `S()` = `{ lounge id, 1, undefined }`. Tap the header's club-page button -> Back. Expected: the space on the Lounge, NO event chat, `history.length` unchanged by the return. One header Back -> the home. Forward from the Lounge (before the link out) still opens the event chat.
- R7 (NAV-3, deep link). Fresh tab `/messages?channel=<event room id>` -> Back (event chat closes) -> `S()` names the Lounge -> club page -> Back: the Lounge, no event chat.
- R8 (NAV-3, Board strip). From an event chat tap the Board strip: the Board, address `?channel=<board>`; club page -> Back: the Board.
- P5 (POLL-2). Two accounts in one Lounge, both visible. A sends "one"; within 1-2 s B sends "two" (before B's next 4-s check shows "one"). Expected on B: "one" appears ABOVE "two" within ~4 s (before: up to 20 s). Network: B's checks ask `?after=` with the time of the last message B was SENT by a read, not B's own.
- P6 (POLL-1). B in a busy Lounge; hide B's page (another tab); A sends 60+ messages; in DevTools block `…/messages?limit=50` once (or go offline for the moment of return), return to B's tab and send a message at once. Expected: within ~4 s the missed messages fill in above B's message with none skipped (scroll up: continuous), or, when more than 200 were missed, the newest 50 with `Earlier messages` leading back through all of them. Never old rows followed directly by B's message with a jump in between.
- P7 (POLL-1). The same without blocking: type a draft on B, hide the page, A sends 60+, return and press Send at once. Expected: the newest 50 then B's message at the end (it does not vanish), `Earlier messages` present and paging back with no jump.
- P8 (POLL-3). B's room with `Earlier messages` showing; hide the page; A sends 60+; throttle to Slow 3G; return and tap `Earlier messages` at once. Expected: the list becomes the newest 50; no block of much older messages is glued above them; tapping `Earlier messages` again pages back from the list as it is now.
- Flag OFF (casey): `/messages` works as before, `history.length` unchanged by opening / closing a thread.
