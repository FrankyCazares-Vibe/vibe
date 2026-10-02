# S71d repair notes (amendment 4: week swipe + month sheet)

Role: repair. Worktree `scratchpad/wave2`, branch `chat-week-nav`. No commit, no push, no SQL, no server, no browser.

Three non-low findings to re-check and repair:
1. The week strip is not re-read on the home's refresh (medium).
2. Closing the month sheet does not put focus back on the opener (medium).
3. The month sheet has no close control a screen reader can reach (medium).

Status log (appended as each finding is done):

## Finding 1 — the week strip is not re-read on the home's refresh: REAL, fixed

Re-check: `MessagesHome.tsx` `useHomeData`: the `refreshKey` effect called `readLists()` only; the week was read on a change of `weekKey` and on return to visible after 5 min. The shell bumps `refreshKey` on every view close (`MessagesMobile.tsx` `closeInPlace`, the `popstate` close, `openDmByHandle`, `ConversationView.onThreadsChanged`), all user-driven, none on a timer. Contract section 1: "The home's refresh re-reads the week on screen." Not met. The finding is right, and so is its remark on the builder's note 5 (there was no 5-minute timer for the week).

Fix (`home/MessagesHome.tsx` only):
- `refreshWeek(range)` in `useHomeData`: reads `range` now, whatever its age, and clears the "last read" times of the other cached weeks, so each of them is read again the next time it comes on screen (its cards stay drawn while that read is out, so a swipe back is still instant).
- A second effect on `refreshKey` calls it for the week on screen. It skips the mount (a ref holds the last `refreshKey` seen), so the first paint still makes ONE calendar read.
- `closeMonth` (every way out of the month sheet) calls it for the week the strip lands on.
- The file's header comment and the `refreshKey` prop comment say the new schedule.

One thing beyond the finding's wording, said so it can be taken out: the finding asks for the week ON SCREEN; I also make the OTHER cached weeks due (one line, `weekAtRef.current.clear()`). Reason: the same contradiction otherwise survives one swipe away (RSVP to a next-week event in a chat, close, swipe to next week: old card for up to 5 min while the sheet is right). Cost: after a refresh, a week seen before is read once more when it next comes on screen.

## Finding 2 — closing the month sheet does not put focus back on the opener: REAL, fixed

Re-check against the installed sources (read, not run: no DOM library is installed):
- `node_modules/@radix-ui/react-dialog/dist/index.mjs:146-149`: the modal content composes `onCloseAutoFocus` as ours first, then `event.preventDefault(); context.triggerRef.current?.focus()`.
- `node_modules/vaul/dist/index.mjs:1409`: vaul's `Content` passes `onCloseAutoFocus` through untouched (`...rest`); the sheet has no `Drawer.Trigger`, so `triggerRef.current` is null.
- `node_modules/@radix-ui/react-focus-scope/dist/index.mjs:91-96`: the scope restores focus to the element focused before it only when the event is NOT default-prevented.
So the old branch "the opener is still there → return and let vaul restore" ended with nothing focused: focus on `<body>`. The finding is right. It is also right that `document.activeElement` at mount does not name the pressed button on an iPhone.

Fix:
- `home/YourWeek.tsx`: `onOpenMonth(day, opener)`; the title and every day pass `e.currentTarget`.
- `home/MessagesHome.tsx`: the sheet's state is `{ day, opener }`; `<MonthSheet opener={…}>`.
- `home/MonthSheet.tsx`: `onCloseAutoFocus` always calls `preventDefault()` and focuses `sheetReturnFocus(opener, title, openingRoom)` with `preventScroll` (as Radix does). A plan row's press sets `openingRoomRef`; the user's own ways out (the handle, the scrim, a drag, Escape) clear it.
- `home/home-rules.ts`: `sheetReturnFocus` (pure): nothing when an event chat is opening; the opener while it is connected; else the week's title; never a detached node.
- Test: `home-rules.test.ts` `sheetReturnFocus: …` (8 assertions).

Left as it is, said plainly: when a plan row is pressed and the room does NOT open (the shell's one-read path failing, build note 6) and the user then leaves with the phone's Back, the flag is still set and that one close restores no focus. The handle, the scrim, a drag and Escape all restore it.

## Finding 3 — the month sheet has no close control a screen reader or a switch can reach: REAL, fixed

Re-check:
- `node_modules/vaul/dist/index.mjs:1537-1609`: `Drawer.Handle` renders a `div` with `aria-hidden="true"`; on a click, with no snap points, it runs `if (!dismissible) closeDrawer(); return;`, so on a dismissible sheet a tap does nothing.
- `node_modules/@radix-ui/react-dialog/dist/index.mjs:135-138`: the modal content calls `hideOthers(content)`, so the scrim (outside the content) is hidden from assistive tech.
- The mockup has two labelled controls: `boards/R3_Month.dc.html:160` (a 44px-high link `Close the calendar, back to your week` around the 40x5 bar) and `:163` (the scrim, `Close the calendar`). The builder's point 10 ("the mockup has none") was wrong.
The finding is right.

Fix (`home/MonthSheet.tsx`): `Drawer.Handle` is replaced by `CloseHandle`, a real `<button type="button" aria-label="Close the calendar, back to your week">`, the first control of the dialog.
- Looks the same: the 40x5 bar 8px under the sheet's top edge, same colour, and the `opacity: .7` vaul's stylesheet gave its handle (so it matches `CardSheet` / `RsvpSheet`). The handle still takes 20px of the sheet: nothing under it moved.
- Target 88x44. It takes the handle's 20px and reaches 24px ABOVE the sheet's top edge, over the scrim (a tap there closed the sheet already), so it covers nothing of the header row (`Today` and the chevrons keep their whole 44px).
- The sheet is still dragged from the handle. With a mouse a drag that lets go without closing ends in a click on the button; that click is not a press (`isTap` in `week.ts`, 8px; the 400 ms rule `useSwipe` uses). A keyboard or screen reader press has no drag before it and always closes.
- `week.ts`: `TAP_SLOP_PX`, `isTap(dx, dy)`. Test: `week.test.ts` `isTap: …` (7 assertions).
- The build notes' points 5 and 10 are corrected in place.

Not verified here (needs the walk): the focus ring of the handle button with a keyboard (the browser's default ring, 88x44, its top half over the scrim), and VoiceOver reading `Close the calendar, back to your week, button` as the first item of the dialog.

## Files changed by the repair (all in the amendment's list)

- `src/components/mobile/messages/home/MessagesHome.tsx` (findings 1, 2)
- `src/components/mobile/messages/home/MonthSheet.tsx` (findings 2, 3)
- `src/components/mobile/messages/home/YourWeek.tsx` (finding 2: `onOpenMonth(day, opener)`)
- `src/components/mobile/messages/home/home-rules.ts` + `home-rules.test.ts` (`sheetReturnFocus`, 1 test)
- `src/lib/chat/week.ts` + `week.test.ts` (`TAP_SLOP_PX`, `isTap`, 1 test)
- `handoffs/chat-redesign/wave-2-build/S71d-build-notes.md` (open points 5 and 10 corrected in place)
- `handoffs/chat-redesign/wave-2-build/S71d-repair-notes.md` (this file)

Not touched: `MessagesMobile.tsx`, `layer-stack*`, `v2-tokens.ts`, any route, any SQL, `/Users/franciscocazares/vibe`. Nothing committed or pushed. No server started, stopped or restarted. No browser driven.

## Gates (final run)

- `npx tsc --noEmit` → exit 0.
- `npm test` → 1,839 tests, 1,839 pass, 0 fail (1,837 before the repair; +2: `isTap`, `sheetReturnFocus`).
- `npx eslint` on the 9 changed source files → 2 errors, both the old ones in the flag-OFF `MessagesMobileV1` (`MessagesMobile.tsx:681` `react-hooks/immutability`, `:734` `react-hooks/set-state-in-effect`; the repair did not touch that file). The other 8 files: clean. No new error, no warning.
- `week.test.ts` + `home-rules.test.ts` under TZ = UTC, America/Indiana/Indianapolis, Pacific/Auckland, Asia/Beirut → 37 pass each.

Scratch checks (not in the repo; `scratchpad/s71d/repair/`, on the reviewer's no-DOM hooks harness in `s71d/rev-dates/`):
- `node sim-refresh.mjs` → 23 checks, 0 fails: the mount makes one calendar read; one `refreshKey` bump = one read of the week on screen and the new RSVP's card appears; a swipe back within the 5 minutes reads nothing; after a refresh a cached week is drawn at once and read once when it shows; a refresh at offset +1 reads next week; closing the sheet reads the strip's week once; closing with a day of another week picked reads exactly that week once.
- `node sim-focus.mjs` → 23 checks, 0 fails: the close-focus event is always default-prevented; focus goes to the day or the title that opened the sheet; to the title when the strip moved; nowhere when a plan row opened its chat; the handle is a labelled button, first in the dialog; a tap or a key press closes; a drag that lets go does not.
- The reviewer's `sim-race.mjs` now fails its two "refreshKey does NOT re-read the week" checks (the fixed behaviour), and `sim-month.mjs` / `sim-stale.mjs` call a day's `onClick()` with no event, which the new `e.currentTarget` needs: both expected.
- The builder's `s71d/smoke.mjs` (real `react-dom/server`) still renders; the sheet's first label is `Close the calendar, back to your week`.

## What I could not do

- No browser, no phone, no screen reader. Real focus (finding 2) and the handle button (finding 3) are proved from the installed Radix / vaul sources and on a harness with no DOM. The walk below has the steps that settle them.
- The sheet's focus after a plan row whose room does not open and a Back by hand (see finding 2) is left as it is.

## Final walk list for the orchestrator

At 375px, signed in as a `chat_v2` user who is not an admin, on `/messages` of this worktree's server (reload first: the code changed). Today is Fri Oct 2, 2026. Start swipes on a day of the strip, not at the very edge of the screen. With a mouse: press, drag, release.

The strip
1. At rest → the title `Your week`, centred, alone: no caption, no pill, no chevrons; Mon 28 … Sun 4 with today's chip. Network on load: ONE `GET /api/me/calendar`.
2. Swipe LEFT on the strip → `Next week`; the `This week` pill at the right; the title's centre is still the screen's centre (±1px); Mon 5 … Sun 11; loading tiles, then that week's cards or `Nothing that week yet.` + `Find events`. One calendar read, Mon Oct 5 00:00 → Sun Oct 11 23:59:59.999 local.
3. Swipe LEFT again → `Oct 12 – 18`; one more read.
4. Swipe RIGHT → `Next week` at once; NO new read.
5. Tap `This week` → `Your week`, the pill is gone, no new read.
6. Swipe RIGHT from this week → `Last week`, all seven days dim. Three more → `Aug 31 – Sep 6`; a fifth does nothing.
7. `Next week` 26 times (the hidden button, step 10) → `Mar 29 – Apr 4`; a 27th does nothing.
8. Drag UP or DOWN starting on the strip → the page scrolls, the week does not change.
9. Drag the CARD ROW sideways → the cards scroll, the week does not change.
10. Keyboard: Tab from the header → `Previous week` shows as a 44px round chevron only while focused; then the title; then `Next week`. Enter moves one week; the hidden text reads `Next week, October 5 to 11`.
11. The days and the card row slide in (about 0.2s); with `prefers-reduced-motion: reduce` → no slide.
12. `document.scrollingElement.scrollWidth` stays 375 during and after a swipe.

The home's refresh (repair, finding 1)
13. On `Your week`, open a DM or a club and close it (Back) → Network at the close: the two list reads AND one `GET /api/me/calendar` for Mon Sep 28 → Sun Oct 4. One per close, none on a timer.
14. Open an event chat of this week, change your RSVP there (Going → Maybe, or Can't go), go back to the home → the card's status / the day's dot is already the new answer (no 5-minute wait, no reload). Open the month sheet → the same answer as the strip.
15. Swipe to `Next week`, then close a chat from there (open a DM, Back) → the calendar read at the close is for Mon Oct 5 → Sun Oct 11 (the week ON SCREEN).
16. After step 13 or 15, swipe to a week seen before → its cards are drawn at once, and one read goes out for it; swipe away and back again → no read.

The month sheet
17. Tap the title at `Your week` → a bottom sheet with the scrim and the handle; the tab bar is hidden; `October` `2026`, `Today`, two chevrons; `Mon … Sun`; 31 days, 3 blank cells before the 1st and 1 after the 31st; Oct 1 dim; Oct 2 has the coral ring AND the fill; `Fri, Oct 2` with `Today · N plans` (or `Today · No plans`); the footer `Only events you RSVP'd to`. One read, Mon Sep 28 00:00 → Sun Nov 1 23:59:59.999 local.
18. Close it → ONE calendar read for the week on screen (repair, finding 1); the strip's cards and dots say what the sheet said.
19. Swipe to `Next week`; tap the title → Mon Oct 5 is filled, Oct 2 has the ring only.
20. Close it; tap Sat in the strip → the sheet opens with that Saturday filled.
21. Tap a day with a dot → the heading, the caption and the rows change; the sheet does not change height. A coral dot = at least one Going; grey = Maybe only. A row: title, `<club> · <time>`, `Going` or `Maybe`.
22. Tap a day with no plans → `Nothing planned.` and `Find events`.
23. Next month (chevron, or swipe the grid LEFT) → `November 2026`, one read (Mon Oct 26 → Sun Dec 6); back to October → no new read. `Previous month` is dimmed at August 2026, `Next month` at April 2027. `Today` → October, Oct 2 picked.
24. With the sheet open press the browser's Back → only the sheet closes; the address is still `/messages`. Back again → Messages is left.
25. Close by the scrim (also: drag down; Escape), then Back ONCE → Messages is left (no dead press).
26. Pick a day of another week (Oct 14), close → the strip is on `Oct 12 – 18` with the pill; exactly ONE week read went out, for Mon Oct 12 → Sun Oct 18.
27. A plan row WITH a room → the sheet closes and the event chat opens over the club space. Back → the space on its Lounge. Back → the home, the strip on that plan's week. Two presses.
28. A plan row WITHOUT a room is not a button.

The sheet's handle is a Close button (repair, finding 3)
29. Look → the handle is the same 40x5 bar, 8px under the sheet's top edge, as `CardSheet`'s; nothing under it moved (`October` is where it was).
30. Accessibility tree (DevTools) or VoiceOver → the FIRST item of the dialog is a button `Close the calendar, back to your week`. No `aria-hidden` element is the only way out.
31. Tap / click the handle → the sheet closes. Open again; Shift+Tab from `Today` reaches the handle (a focus ring shows around it); Enter (and Space) closes.
32. With a mouse, press the handle, drag about 60px down slowly, let go → the sheet springs back and STAYS open. Drag far down → it closes, as before.
33. `Today` and the two month chevrons, tapped near their top edge → they still answer (the handle's target reaches up over the scrim, not down over them). A tap just above the sheet's top edge at the centre → closes.

Focus after the sheet closes (repair, finding 2)
34. Click Sat in the strip, then close by the scrim → `document.activeElement` is that Saturday's button (`aria-label` starts `Saturday`), not `<body>`. Same with Escape, with the handle, with Back.
35. Open from the title, close → `document.activeElement` is the title's button.
36. Open from a day, pick Oct 14, close → the strip is on `Oct 12 – 18` and `document.activeElement` is the title's button.
37. Press a plan row with a room → once the event chat is open, `document.activeElement` is inside the chat (or `<body>`), never a button of the home under it.
38. On an iPhone (the Vercel preview, later): tap a day, close the sheet → no focus ring is drawn on the day; with VoiceOver on, the cursor is back on that day.

Failures and themes
39. Block `/api/me/calendar`, swipe to a week not seen yet → `Couldn't load your week.` with Retry for that week; swipe back → the other week's cards are intact. Unblock, swipe to the failed week, Retry → it loads.
40. With the calendar blocked, close a chat (a refresh) on a week that has cards → the cards stay, no failure line (a failed re-read is quiet).
41. Block it and open the sheet on a month not read yet → the grid without dots and `Couldn't load your calendar.` with Retry; unblock, Retry → the dots and the rows.
42. Light and Night → the sheet, the handle bar, the picked day's fill, today's ring, `Going` / `Maybe`, the `This week` pill all read in both.
43. A flag-OFF account on `/messages` → today's list, unchanged.
