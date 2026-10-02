# S71d build notes — swipe the week + the month sheet (amendment 4)

Builder. Worktree `scratchpad/wave2`, branch `chat-week-nav`. No commit, no push, no SQL, no server, no browser.

## Log

- Read the contract (S71-amendment-4.md) completely. Starting the read of the existing code.
- Read: week.ts + test, home/{MessagesHome,YourWeek,home-rules + test}, CardSheet, RsvpSheet, use-layer-history, layer-stack, v2-tokens, theme, sheet-styles, use-hide-tabbar, the calendar route, MessagesMobile (the shell's `openView` / `openRoom` / popstate), the three mockups (R3_NextWeek, R3_Month, W0_Home), vaul 1.1.2's drag gate and CSS.

## Decisions taken before writing (each one is a place where the contract left a choice)

1. **Previous week / Next week buttons: visually hidden until focused.** Two real `<button>`s in the title row, in the DOM order Previous, title, Next, (pill). They take no room and draw nothing until one has keyboard focus, then it shows as a 44px quiet chevron at its end of the row. So at offset 0 the row is the centred title and nothing else, exactly as Franky left it on Oct 1. A screen reader reaches them in order.
2. **The mockup's two tiny edge chevrons (R3_NextWeek:29-30, 7x12, muted, in the strip's 12px side padding) are drawn only away from the current week**, as decoration (`aria-hidden`). W0_Home (offset 0) draws none, so the strip at rest is pixel-for-pixel what is live today. One constant (`EDGE_HINTS_AT_REST`) shows them at rest too if Franky wants the hint.
3. **The live region is the title row itself** (`aria-live="polite"`, `aria-atomic`), and it holds only the heading; the pill and the two buttons are siblings of it, so the pill appearing is not read out. It announces `Next week, October 12 to 18`.
4. **The month sheet is a root vaul drawer** (`Drawer.Root`, not `NestedRoot`): the home is not inside a drawer, and `NestedRoot` throws without one. Same overlay / content / handle styles as the other sheets, `useHideTabBar()` (the tab bar is z 9988 and would cover the sheet's foot), `useLayerHistory(true, …)`.
5. **The sheet has a fixed height** (`min(88dvh, 580px)`), the day's plans scroll inside it. The mockup's sheet hangs from the top and hugs its content; the contract makes it a bottom sheet, and a bottom sheet that hugs would move the whole grid under the finger every time the picked day has a different number of plans.
6. **No 48px event thumbnail in a plan row** (R3_Month:152): the calendar entry carries no image and the contract's row is title, `<club> · <time>`, pill. The 14px club dot of the mockup's second line is kept.

## Log (continued)

- `src/lib/chat/week.ts`: added `WEEK_MIN_OFFSET` / `WEEK_MAX_OFFSET`, `clampWeekOffset`, `weekRangeAt`, `weekOffsetOf`, `startOfLocalDay`, `dayDiff`, `weekTitle`, `weekSpoken`, `weekWord`, `SWIPE_MIN_PX` / `SWIPE_RATIO`, `swipeDirection`, `sheetStartDay`, `MonthRef`, `monthOf`, `addMonths`, `compareMonths`, `monthName`, `monthBounds`, `clampMonth`, `MonthGrid`, `monthGrid`. All calendar arithmetic (no +24h).
- `src/lib/chat/week.test.ts`: 12 new tests (19 in the file), green in five time zones (UTC, Indianapolis, Auckland, Sao Paulo, Beirut).
- `home/home-rules.ts`: added `spokenDay`, `dayHeading`, `planCountText`, `dayCaption`, `isPastDay`, `monthDayLabel`, `PlanRow`, `planRows` (pure). `home-rules.test.ts`: 5 new tests (15 in the file), green.
- `home/home-rules.ts`: also `calendarUrl` and `rsvpEntries` (the calendar answer → `WeekEntry[]`), moved out of `MessagesHome.tsx` (they were `isRsvpEntry` / `toWeekEntry` there) because the month sheet needs the same parse; one more test (16 in the file).
- `home/MessagesHome.tsx` (data): `weekOffset` + a per-week cache (`weeks`, keyed by the Monday's `getTime()`), `readWeek(range)`, `readWeekIfStale` (5 min, as today's rule), `stepWeek`, `setWeekOffset`, `retryWeek` for the week on screen.
- **A file outside the contract's list: `src/components/mobile/MessagesMobile.tsx`, 12 lines in `openView` (flag-ON shell only). Why:** the month sheet owns a history entry (contract 2, `useLayerHistory`), and a plan row opens its event chat with the sheet still up. `openView` cleared sheets with `clearLayersThen`, which steps BACK off the sheet's entry and then PUSHES the room's. `layer-stack.ts` forbids exactly that ("NEVER A STEP BACK FOLLOWED BY A NEW ENTRY"): after a same-document back, Chrome no longer counts the earlier tap, so the push would mark the home's entry (and then the space's) as skippable and the phone's Back from the event chat would jump out of Messages. Until now no sheet could be open over the HOME, so the case did not exist. The fix is the one `ClubSpace.openEvent` already uses over the "+" tray: `clearLayersInto` — the sheet's entry BECOMES the room's by `replaceState`; with no sheet open it is a `pushState`, byte for byte what it was. The swap branch (a view already open) is unchanged. Nothing a flag-OFF user reaches (`MessagesMobileV2` mounts only with the flag on).
- `home/YourWeek.tsx`: rewritten top half (the card is untouched). `useSwipe` (pointer events, `touch-action: pan-y`), `SLIDE_CSS` + `slideClass`, the title as a button, the `This week` pill, the two hidden-until-focused step buttons, the days open the month sheet, the per-week empty line, the slide-in keyed by the week.
- `home/MonthSheet.tsx` (new): the sheet, `MonthHeader`, `DayPlans`. Reads its own months (`calendarUrl(grid.from, grid.to)`), cached by `year-month` while it is open.
- `home/MessagesHome.tsx` (screen): `sheetDay` state, `openMonth` / `closeMonth` (the strip moves to the picked day's week, clamped), `<MonthSheet>` mounted only while open.
- First gate run: `npx tsc --noEmit` exit 0; `npm test` 1,832 pass / 0 fail (baseline 1,814, +18); `npx eslint` on the 8 changed files: 2 errors, both in `MessagesMobile.tsx`'s flag-OFF `MessagesMobileV1` (lines 681 and 734 now, 672 and 725 at HEAD: the same two, checked by linting HEAD's file through stdin). No new error.
- Now reading my own diff again as a reviewer would.
- **A second file outside the list: `src/lib/chat/layer-stack.test.ts`, 5 tests appended (tests only, `layer-stack.ts` itself is untouched). Why:** the stack had never held a sheet over the HOME's entry (no room marks). The tests pin it: the sheet's entry is `{ sheet: 1 }`; Back closes the sheet alone; the scrim close steps off its own entry; a plan row turns the sheet's entry into the space's with no traversal and the browser's Back still stops on every entry; and the control case — the old `clearLayersThen` + push — is shown to trip the test harness's model of Chrome's rule (`trapped() === true`). 45 tests in the file, green.
- `MonthSheet`: the grid is `data-vaul-no-drag`. vaul only decides "this is a sideways move, not mine" in the first 10px; a swipe that starts a little downward would drag the sheet too, and a fast one would close it while the month also changed. The sheet still drags down from the handle, the header and everything under the grid; the scrim and Back close it.
- Render smoke test (no browser, no server): a scratch Node loader transpiles the worktree's TSX and renders `YourWeek` at offsets 0, +1, −1, +3, +26, −4, its loading and failure rows, `MonthSheet`'s first paint, `DayPlans` in its four states and `MonthHeader` with `react-dom/server` (vaul and `next/link` stubbed). Everything rendered; the labels and texts are the contract's. Re-run: `cd <scratchpad>/s71d && node smoke.mjs`.
- `MonthSheet` Retry fixed in review: it re-reads the month that FAILED (the month on screen, else the picked day's month), not always the month on screen.

## Files changed

In the contract's list:
- `src/lib/chat/week.ts` (+159) and `src/lib/chat/week.test.ts` (+12 tests)
- `src/components/mobile/messages/home/home-rules.ts` (+135) and `home-rules.test.ts` (+6 tests)
- `src/components/mobile/messages/home/YourWeek.tsx` (top half rewritten; `WeekCard` untouched)
- `src/components/mobile/messages/home/MessagesHome.tsx` (the week data, the sheet's state)
- `src/components/mobile/messages/home/MonthSheet.tsx` (new)
- `v2-tokens.ts`: NOT touched. No token was missing: the mockup's `rgba(255,255,255,a)` tints are `rgba(var(--scrim-rgb),a)` (white in Night, ink in Light), the rest is `palette()`.

Outside the list, each said why above:
- `src/components/mobile/MessagesMobile.tsx` (`openView`, 12 lines, flag-ON shell)
- `src/lib/chat/layer-stack.test.ts` (5 tests appended; `layer-stack.ts` untouched)

Not touched: the calendar route, any SQL, anything a flag-OFF user reaches, `/Users/franciscocazares/vibe`. Nothing committed or pushed. No server started, stopped or restarted. No browser driven.

## Gates (final run)

- `npx tsc --noEmit` → exit 0.
- `npm test` → 1,837 tests, 1,837 pass, 0 fail (baseline 1,814; +23: week 12, home-rules 6, layer-stack 5).
- `npx eslint` on the 9 changed files → 2 errors, both old and both in the flag-OFF `MessagesMobileV1` inside `MessagesMobile.tsx` (`react-hooks/immutability` at line 681, `react-hooks/set-state-in-effect` at 734; the same two at 672 and 725 on HEAD, checked with `git show HEAD:… | npx eslint --stdin`). No new error, no warning. The other 8 files: clean.
- `week.test.ts` also green under TZ = UTC, America/Indiana/Indianapolis, Pacific/Auckland, America/Sao_Paulo, Asia/Beirut.

## What I could not do

- **No browser walk and no phone.** Everything on screen is unseen by me: the swipe on a real touch screen (pointer events with `touch-action: pan-y`; iOS Safari and Android Chrome), the slide-in, the sheet's look in Light and Night, the fixed 580px height on a short phone, the title staying centred beside the pill. The render smoke test proves markup and labels only.
- **Chrome's "skip this entry" rule is checked against the test harness's model of it** (`layer-stack.test.ts`), as amendment 3 was, not against a real Chrome Back button.

## Open points for the orchestrator (none blocks the walk)

1. **The mockup's month sheet hangs from the TOP of the screen** (R3_Month:97, under the header, radius on its bottom corners, handle at its foot). The contract says a BOTTOM sheet like the app's others; I built the contract. If Franky expected the mockup's drop-down, that is a different component.
2. **A day outside the strip's reach.** The sheet can show all of August 2026 (the month holding the −4 week), but the strip stops at the week of Aug 31. Picking Aug 3 and closing lands the strip on its nearest bound (Aug 31 – Sep 6), not on Aug 3's week.
3. **The empty line and the loading row are not swipe areas** (contract: "the week header + day strip"). On an empty week a swipe on `Nothing on your week yet.` does nothing. One line to widen if wanted.
4. **Edge chevrons at rest are off** (`EDGE_HINTS_AT_REST` in `YourWeek.tsx`). At offset 0 nothing on screen says the strip swipes.
5. ~~The week is still not re-read when a chat closes.~~ **Corrected by the repair (S71d-repair-notes.md, finding 1).** As first written this point said the strip showed the old card "for up to 5 minutes"; that was wrong: nothing re-read the week while the app stayed in the foreground on the same week (the 5-minute rule only ran on a return to visible or when a week came on screen). Now `refreshKey` (a view closed) and the month sheet closing both read the week on screen at once and make the other cached weeks due.
6. **A plan row whose entry has a room but no club handle** (not seen in the data; the route sends `org` with every org event) takes the shell's one-read path: the sheet stays up for that read and closes when the room opens. Closing the sheet by hand during that read brings back the step-back-then-push order.
7. **A failed week stays failed for 5 minutes** unless Retry is tapped: swiping away and back shows its failure line again rather than reading again. (Contract: "A failed read shows today's failure line for that week (Retry re-reads it)".)
8. **320px-wide phones:** the longest title (`Sep 28 – Oct 4`) and the pill end about 3px apart. Fine from 360px.
9. `src/lib/chat/use-hide-tabbar.ts`'s comment lists its callers; `MonthSheet` is now one and the comment does not say so (file not in my list, not edited).
10. ~~No close button in the sheet (the mockup has none).~~ **Corrected by the repair (finding 3).** The mockup has two labelled close controls (`R3_Month.dc.html:160` the handle, `:163` the scrim). The handle is now a real button, `Close the calendar, back to your week`; the scrim, a drag, Escape and Back close it too.

## Walk list for the orchestrator

At 375px, signed in as a `chat_v2` user who is not an admin, on `/messages` of this worktree's server. Dates below assume today is Fri Oct 2, 2026. Start swipes on a day of the strip, not at the very edge of the screen (the phone's own back gesture lives there). With a mouse: press, drag, release.

**The strip**
1. At rest → the title `Your week`, centred, alone: no caption, no pill, no chevrons. The strip is Mon 28 … Sun 4 with today's chip. Same as production.
2. Swipe LEFT on the strip → `Next week`; a `This week` pill at the right end; the title's centre is still the screen's centre (±1px); two tiny chevrons at the strip's edges; Mon 5 … Sun 11, no today chip, nothing dimmed; the card row shows the loading tiles, then that week's cards or `Nothing that week yet.` + `Find events`. Network: one `GET /api/me/calendar?from=<Mon Oct 5 00:00 local>&to=<Sun Oct 11 23:59:59.999 local>`.
3. Swipe LEFT again → the title is `Oct 12 – 18`; one more calendar read.
4. Swipe RIGHT → `Next week` at once; NO new calendar read.
5. Tap `This week` → `Your week`, the pill is gone, no new read.
6. Swipe RIGHT from this week → `Last week`, all seven days dim. Three more → `Aug 31 – Sep 6`; a fifth swipe does nothing and the left edge chevron is gone.
7. `Next week` 26 times (the hidden button, step 10) → `Mar 29 – Apr 4`; a 27th does nothing; the right edge chevron is gone.
8. Drag UP or DOWN starting on the strip → the page scrolls, the week does not change.
9. With cards on screen, drag the CARD ROW sideways → the cards scroll, the week does not change.
10. Keyboard: Tab from the header → `Previous week` appears as a 44px round chevron at the left end only while it has focus; then the title; then `Next week` (right end, left of the pill when the pill is there). Enter moves one week and focus stays on the button. The title row is `aria-live="polite"`; its hidden text reads `Next week, October 5 to 11`.
11. Motion → the days and the card row slide in from the side they came from (about 0.2s). With `prefers-reduced-motion: reduce` → no slide.
12. `document.scrollingElement.scrollWidth` stays 375 during and after a swipe.

**The month sheet**
13. Tap the title at `Your week` → a bottom sheet with the scrim and the handle; the tab bar is hidden; `October` `2026`, `Today`, two chevrons; `Mon … Sun`; 31 days, 3 blank cells before the 1st and 1 after the 31st; Oct 1 dim; Oct 2 has the coral ring AND the fill; `Fri, Oct 2` with `Today · N plans` (or `Today · No plans`); the footer `Only events you RSVP'd to`. Network: one calendar read from Mon Sep 28 00:00 to Sun Nov 1 23:59:59.999 local.
14. Close it; swipe to `Next week`; tap the title → Mon Oct 5 is filled, Oct 2 has the ring only.
15. Close it; tap Sat in the strip → the sheet opens with that Saturday filled.
16. Tap a day with a dot → the heading, the caption and the rows change; the sheet does not change height and the grid does not move. A coral dot = at least one Going; grey = Maybe only. A row: title, `<club> · <time>`, `Going` (coral, check) or `Maybe` (grey dot).
17. Tap a day with no plans → `Nothing planned.` and `Find events`.
18. Next month (chevron, or swipe the grid LEFT) → `November 2026`, six rows, one read (Mon Oct 26 → Sun Dec 6); the picked day's heading stays. Back to October → no new read. `Previous month` is dimmed at August 2026, `Next month` at April 2027. `Today` → October, Oct 2 picked.
19. With the sheet open press the browser's Back → only the sheet closes; the address is still `/messages`; the home is as it was. Back again → Messages is left, as before.
20. Close by the scrim (also: drag the handle down; Escape), then Back ONCE → Messages is left (no dead press).
21. Pick a day of another week (Oct 14), close → the strip is on `Oct 12 – 18` with the pill.
22. A plan row WITH a room → the sheet closes and the event chat opens over the club space. Back → the space on its Lounge. Back → the home, the strip on that plan's week. Two presses, no more.
23. A plan row WITHOUT a room is not a button: tapping it does nothing.

**Failures and themes**
24. Block `/api/me/calendar`, swipe to a week not seen yet → `Couldn't load your week.` with Retry for that week; swipe back → the other week's cards are intact. Unblock, swipe to the failed week, Retry → it loads.
25. Block it and open the sheet on a month not read yet → the grid without dots and `Couldn't load your calendar.` with Retry; unblock, Retry → the dots and the rows.
26. Light and Night → the sheet, the picked day's fill, today's ring, `Going` / `Maybe`, the `This week` pill all read in both.
27. A flag-OFF account on `/messages` → today's list, unchanged.
