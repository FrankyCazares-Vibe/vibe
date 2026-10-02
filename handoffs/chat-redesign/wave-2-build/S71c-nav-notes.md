# S71c — batch NAV notes (amendment 3: A = F06, B = F07, E = F09)

Started 2026-10-01. Worktree only; no commit, no push, no SQL, no server, no browser.

## Log
- Read the contract (S71-amendment-3.md), all of it.
- Read: MessagesMobile.tsx (V2 shell, popstate owner, openers), ClubSpace, EventChat, RoomThread, EventAbout, BoardStrip, RoomComposer, compose/* (tray, CardSheet, sheets), RsvpSheet, RemoveConfirm, bridge.ts + NativeBridge.tsx (Android back = cancelable `vibe:native-back`, nobody cancels, so it is `history.back()`), contract 2.3 / 11.0 / 11.5 / 11.6 / 17.1 rows 11, 23, 24, 27 / 17.5 #19 / 17.9, audit F06-F09, Next's app-router.js pushState/replaceState patch + restore reducer, the audit's nextrepro Shell.
- Next facts used: the patched `pushState(data, "", url?)` copies `__NA` + the router tree onto the new entry (a pop onto an entry without `__NA` makes Next reload the page); with a `url` it also dispatches a router restore; without one it only copies. A traverse restore keeps custom state (`preserveCustomHistoryState: true`).

## Design (A) — one pure stack + one hook

- `src/lib/chat/layer-stack.ts` (pure, no DOM, no imports): the module-level stack of open sheet layers, the list of traversals it started itself (so their `popstate` is recognised), a queue of history work that waits for those, and `handlePop(state) -> "layer" | "other"` ("who owns this pop").
- `src/lib/chat/use-layer-history.ts`: the browser wiring (one stack per page, `window.history`), `useLayerHistory(open, onPop, canPop?)` for every sheet / tray / confirm, and three helpers for the two existing `popstate` owners: `isLayerPop(event)`, `clearLayersThen(fn)`, `adoptLayerEntry()`.
- A sheet entry = the room entry's own marks plus `sheet: <n>`: `{ vibeChat, depth, sheet: 1 }`, pushed with `window.history.pushState(state, "")` (Next's patched function, so `__NA` and the router tree are copied; no URL argument because the URL does not change, so Next dispatches no router restore for a sheet). The `{ vibeChat, depth }` room entries are untouched.
- State-driven: `open` true -> push; `open` false or unmount -> `history.back()` if the live entry is still the sheet's (never when the page has navigated away: a link tapped with the tray open must not be bounced back); a user Back -> `onPop` (or a re-push while `canPop()` is false).
- A push asked while one of the module's own traversals is in flight waits for its `popstate` (tray -> sheet in one commit; React StrictMode's mount / cleanup / mount in dev).
- Owners: every room-level history write or `history.back()` goes through `clearLayersThen` (closes whatever sheets are on top first, then runs). With no sheet open it runs at once, as before.
- An entry with a `sheet` mark that nobody owns (after a reload, after a link out with the tray open, Forward onto a closed sheet) is popped by the module ("bounce"); the landing is reported as "other" so the shell re-opens the room from it (B).
- Written: `src/lib/chat/layer-stack.ts` + `layer-stack.test.ts` (21 tests, green alone), `src/lib/chat/use-layer-history.ts`.
- A applied so far: `CardSheet` (hook inside, `canPop = !posting`), `RsvpSheet` (hook inside), `RemoveConfirm` (hook inside: covers RoomThread and BoardView), `RoomThread` Report (hook beside the state). `ReportSheet.tsx` NOT edited (the entry is taken by the caller's state, so every other caller of ReportSheet is untouched).
- E applied: `RoomThread` pins for both anchors (layout effect on a new last row, ResizeObserver on the box and the content, PIN_SLACK 80px, reader who scrolled up is not moved), new optional `header` prop drawn inside the scroller; `EventChat` passes About + the Board strip as that header. The sticky 14px fade now sits after the header inside one min-height column, so it stays under the strip at the top and sticks once the header has scrolled away.
- A applied to the owners: `ClubSpace` (popstate: `isLayerPop` first; every write / back through `clearLayersThen`: the 403 / 404 close, the deep-linked event layer's push, `openEvent`, `closeEvent`, `openBoardFromLayer`, `pickRoom`), `RoomComposer` (the tray's entry, only while the tray is drawn), `BoardView` (Report).
- A + B applied to `MessagesMobile.tsx` (V2 only): `openFromEntry` (one resolver for arrival and for a restored entry), `liveChannel` (URL first, then `history.state`), `adoptLayerEntry()` on mount, popstate re-opens when nothing is open, `closeLayer` through `clearLayersThen` + a 600 ms fallback when no popstate comes + one Back at a time.
- `npx tsc --noEmit` exit 0 after these edits.
- Added two pure helpers to `layer-stack.ts` with tests: `channelOfEntry(search, state)` (B: what an entry says is open) and `arrivalWrites(state, id, eventRoom)` (B: an event room's own depth-2 entry is kept as is). 23 tests in the file.
- Guard added while reviewing: a `popstate` that LEAVES `/messages` still reaches the shell's handler before Next unmounts it, and the new "re-open from the entry" rule would have read another page's `?channel=` (for example an old `/campus?channel=` entry) and written on its history entry. The shell now remembers its own path on mount and only re-opens / writes while the address is still that path (`onThisPage`).
- `closeLayer`: one Back at a time (a double tap would step back twice), checked inside the deferred work as well.

## Decisions worth knowing (each stays inside A / B / E; say if any should go)

1. **A sheet entry is pushed with no URL** (`pushState(state, "")`). The contract says "do it the same way" as the room entries, which pass a URL. What matters there is Next's patched `pushState` (it copies `__NA` and the router tree; a pop onto an entry without `__NA` reloads the page), and that is what is called. The URL is left out on purpose: a sheet does not change the address, and with a URL Next also dispatches a router restore per sheet. Same pattern as `OnboardingMobile.tsx` (`pushState({ ...history.state, onbStep }, "")`).
2. **`closeLayer` falls back after 600 ms** (`BACK_FALLBACK_MS`): after a restore or a reload on a fresh tab's deep link there is no entry behind the room, `history.length` cannot tell (forward entries count), `history.back()` brings no `popstate` and the header Back would be dead. `navigation.canGoBack === false` closes in place at once where the Navigation API exists; elsewhere the timer does. Needed for B's "one header Back closes it".
3. **`?to=` on a restored page**: Next hands back the first address's props, so `initialHandle` is dropped on mount unless the live address still has `?to=` (otherwise back-from-a-profile on a DM opened by `?to=` could push a second entry for it).
4. **`initialChannelId` is no longer what opens a room**: the live address / state is (contract B). The prop is used only if the address cannot be read. A restored HOME entry therefore stays the home even when the cached props still carry a channel.
5. **Forward onto the event chat's entry with only the space open** now opens the event chat (`ClubSpace` popstate, depth >= 2): B's rule at depth 2. Before, the address was the event's while only the space showed, and the space's Back then needed two taps.
6. **A room that fails to open from a restored entry** behaves as the deep link's failure does today: home on All, `/messages`, the toast.
7. **Not given an entry (not in A's list, left as they are)**: the long-press message menu / reaction picker, and the old conversation view's own sheets in a DM (its action sheet, group settings, its Report). Back with one of those open still closes the DM or the space, as before.
8. `ReportSheet.tsx` is unchanged: the entry is taken by `RoomThread` / `BoardView` next to their `reportMessage` state.
9. RSVP sheet and the remove confirm close on Back even while their request is in flight (the request finishes and the room reloads / the row is dropped, as with the scrim today). Only a card that is posting blocks Back (contract A).

## Flag OFF

`MessagesMobile.tsx` is the one shared file. Its diff is: two imports (no side effect at import: the stack and its `popstate` listener are created on the first call from a flag-ON component), module-level helpers used only by `MessagesMobileV2`, and `MessagesMobileV2` itself. `MessagesMobileV1`, `FlagPending` and the fork are byte-identical (`git diff -U0` hunks all sit above line 554, where V1 starts). Every other changed file is mounted only under `MessagesMobileV2` (`ClubSpace` and below). `ConversationView`, the old list, `CampusMobile`, the static pages: not touched.

## Requests to POLL

None. Note for whoever reads both: `RoomThread` now follows the newest row for both anchors from `lastId` / `rowCount`; D's "replace the list by the page" changes `lastId`, so a pinned reader lands on the newest row and an unpinned one keeps their scroll offset.

## Files changed (NAV)

- NEW `src/lib/chat/layer-stack.ts` (pure core), `src/lib/chat/layer-stack.test.ts` (26 tests), `src/lib/chat/use-layer-history.ts` (hook + owner helpers)
- `src/components/mobile/MessagesMobile.tsx` (V2 only)
- `src/components/mobile/messages/club/ClubSpace.tsx`, `EventChat.tsx`, `EventAbout.tsx` (doc line only), `RoomThread.tsx`, `RoomComposer.tsx`, `BoardView.tsx`, `RsvpSheet.tsx`
- `src/components/mobile/messages/compose/CardSheet.tsx`
- Not edited: `RoomChips.tsx`, `use-room-poll.ts`, `page-merge.ts` (POLL's), `ReportSheet.tsx`, `BoardStrip.tsx`, the three sheets, `CardTray.tsx`, `ComposeSheets.tsx`.

## Gates (2026-10-01, with POLL's edits in the same tree)

- `npx tsc --noEmit` → exit 0.
- `npm test` → 1,788 pass, 0 fail (baseline 1,736; 26 of the new ones are `layer-stack.test.ts`, the rest are POLL's).
- `npx eslint` on the 12 files above → 2 errors, both in `MessagesMobileV1` (`react-hooks/immutability` on `refetchThreadsRef`, `react-hooks/set-state-in-effect` on `setOpenThreadId`), both present at HEAD (the same file from `git show HEAD:` linted through `--stdin` gives the same 2, at :526 and :579; they moved to :659 and :712). 0 new.

## Could not do

- No browser, no server, no device (rule G): nothing here was seen running. The Next behaviour relied on was read from `node_modules/next/dist/client/components/app-router.js` and the reducers, not exercised.
- Not proven by a test: the React wiring (the hook's effects, the two owners). The stack and the two B decisions are tested without a DOM.
- The traversal after a RELOAD (stepping off a leftover sheet entry) assumes the browser treats the sheet entry and the room entry as the same document (they are `pushState` siblings). If a browser reloads instead, the page simply loads on the room entry, which is also fine.

## Walk list for the orchestrator (375px, flag ON: blake = member, avery = owner; hard-reload the page first, the files were hot-swapped)

In the console, `S = () => { const s = history.state; return { vibeChat: s?.vibeChat, depth: s?.depth, sheet: s?.sheet } }`. In `next dev` React mounts effects twice, so opening a sheet does push / back / push; the end state is what counts.

### A — Back closes only the sheet (F06)
1. Home → a club → Lounge. `S()` = `{ lounge id, 1, undefined }`. Tap "+". Expected: the tray; `S().sheet === 1`, depth still 1, the address unchanged. `history.back()`. Expected: ONLY the tray closes (the "+" turns back), the space stays, `S().sheet` undefined.
2. "+" → Poll. Expected: the New poll sheet; `S().sheet === 1` (one sheet entry, not two). Type a question. `history.back()`. Expected: only the sheet closes; the Lounge is still there; address still `?channel=<lounge>`. `history.back()` again → the home, `/messages`.
3. Open the sheet again, close it with ✕. Expected: `S().sheet` undefined at once after; ONE `history.back()` → the home (no dead press). Repeat closing by the scrim.
4. Post a poll from the sheet. Expected: it appears in the Lounge, the sheet is gone, `S().sheet` undefined; one Back → the home.
5. Posting guard: slow the request (DevTools throttling, or wrap `fetch` so `/cards` waits 3 s), tap `Post poll`, call `history.back()` while it says `Posting…`. Expected: the sheet stays on `Posting…`, `S().sheet === 1` again, the address unchanged; the poll posts ONCE; then the sheet closes.
6. New sign-up and Share an event: steps 2–3 on each.
7. Event chat (an event chip): `S().depth === 2`. Tap the RSVP pill. Expected: `S()` = `{ event id, 2, 1 }`. Back → only the RSVP sheet closes (depth 2). Back → the space (depth 1). Back → the home.
8. In the event chat: "+" → Poll → Back, Back, Back, Back = sheet, event chat, space, home, one each.
9. Report: long-press another person's message → Report. Expected: `S().sheet === 1`; Back closes only the Report sheet. The same on the Board (a card post).
10. As avery: long-press a member's message → Remove → the confirm. Back. Expected: the confirm closes, the message is still there, the space is open. Then Remove → `Remove` works as before and leaves no entry (one Back → the home).
11. Tray open, tap the Board chip. Expected: the Board, no tray, `S()` = `{ board id, 1, undefined }`, address `?channel=<board>`; one Back → the home.
12. Tray open, tap an event chip. Expected: the event chat (depth 2); Back → the Lounge with the tray closed; Back → the home.
13. Tray open, tap the space's header Back. Expected: the home in one tap, `/messages`.
14. Reload with the New poll sheet open (`location.reload()`). Expected: the space on the Lounge, no sheet, `S().sheet` undefined; the FIRST Back goes to the home (not a dead press).
15. The space lost under an open sheet: blake has the New poll sheet open in the Lounge; from avery's session remove blake from the club. Within about 20 s: the toast `Members only.`, the home, `/messages`; Back from there leaves Messages (nothing re-opens, no dead press).
16. Flag OFF (casey): `/messages`, open a thread, close it: `history.length` does not change (no history writes), as before.

### B — Back from a link out returns to the room (F07)
17. In a club space on the Lounge, tap the header's right button (the club page). Then Back. Expected: Messages, briefly the home, then the SAME space on the Lounge; address `?channel=<lounge>`, `S().depth === 1`. Tap the header Back ONCE → the home, `/messages`.
18. The same from the Board chip. Expected: back on the Board.
19. In the event chat tap a person's name or avatar on a message (their profile), then Back. Expected: the space with the event chat on top, `S().depth === 2`; Back → the space; Back → the home (no dead press).
20. A DM from the home: tap the person's name in the header (profile), Back. Expected: the DM again; one header Back → the home. The same from a shared post bubble.
21. Up next's link and the empty club's links (an officer of a new club), Back. Expected: the space.
22. Home → a club → header Back (home) → the browser's Forward. Expected: the space opens again (before: the address was rewritten to the home's). Then Forward again onto an event chat's entry, if there was one: the event chat opens over the space.
23. A fresh tab on `/messages?channel=<lounge>` → the club page → Back → the header Back. Expected: the space closes to `/messages` (at once in Chromium; within about 0.6 s where there is no Navigation API).
24. `/messages?channel=<lounge>` fresh → header Back (closes in place) → the tab bar to Campus → Back. Expected: the HOME, not the room.
25. `/messages?channel=<a room blake cannot read>`: the home on All, `/messages`, the toast, as before. `/messages?to=<handle>`: the DM, as before.
26. With a tray open tap the header's club-page button, then Back. Expected: the space on its room, no tray, `S().sheet` undefined (the tray's leftover entry is stepped off), one header Back → the home.

### E — the event chat follows the newest message (F09)
27. An event chat with more than a screen of messages. Expected: it opens on the NEWEST message; scrolling up brings the Board strip and the About block (hero, Where / When, Who's going, the RSVP pill) into view above the oldest rows; the header (`Back to <club>`, the title) never moves.
28. At the bottom, send from another account. Expected: the new message is in view within about 4 s without touching the screen.
29. Scroll up more than about 80px, send again from the other account. Expected: the view does not move.
30. An event chat with 0–3 messages. Expected: About at the top, the Board strip, the rows straight under it (or `Say hi to everyone going.`), nothing scrolled.
31. Keyboard up (a phone, or the pane's height at about 400px with the composer focused). Expected: the newest message stays visible above the composer; About has scrolled away; the header stays.
32. The top fade: at the very top it sits under the Board strip (not over the hero); once scrolled it is at the top of the thread.
33. The Lounge is as before: opens at the bottom, follows new messages, `Earlier messages` keeps the reader's place, the tray's scrim covers the thread.
34. Light and Night for 27 and 30; `document.scrollingElement.scrollWidth === 375` in the event chat.

### On a device later (f9 / iPhone pass)
35. Android hardware back and the iPhone edge swipe on steps 2, 7 and 17 (both are `history.back()`).
