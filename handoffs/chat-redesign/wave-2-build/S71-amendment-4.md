# S71 amendment 4 — swipe the week, and a month sheet (Franky, Oct 2)

Franky, after his first phone test of the new chat on production: "I want it to be where you can swipe the week section to the left and go to the next week to see next week's events … or click on a day and it opens up the big calendar so you can see the entire calendar, kind of like a modal." Both were in his Option 3 pick and were cut from wave 2 (contract 11.2 "Not in v1"; 15 "After launch"). The approved mockups are `handoffs/chat-redesign/boards/R3_NextWeek.dc.html` and `R3_Month.dc.html` (read their source for sizes, tokens and copy; `W0_Home.dc.html` for the strip as built). Design notes: `franky-brief.md:17`, `wave-plan.md:24`.

Base: branch `chat-week-nav` (from `main` `c0e4db2`, production). Phone only, behind `chat_v2`: `src/components/mobile/messages/home/*`, `src/lib/chat/week.ts`. **No server route, no SQL, no change to anything a flag-OFF user reaches.** `GET /api/me/calendar?from=&to=` already takes any range (default window: 30 days back to 180 days ahead) and is used as is.

## 1. The week strip swipes (R3_NextWeek)

- The home keeps a `weekOffset` (0 = the device's current week). A horizontal swipe on the week header + day strip moves one week: swipe LEFT → the next week, swipe RIGHT → the week before. Bounds: 4 weeks back, 26 weeks ahead (the calendar route's default window). A swipe is |dx| ≥ 40px and |dx| > 1.5 × |dy|; a vertical scroll of the page is never taken. The card row keeps its own horizontal scroll: a swipe that starts on the card row scrolls the cards, never the week.
- The title stays centred (Franky removed the "Sep 28 – Oct 4 · your RSVPs" caption on Oct 1 because it felt cluttered; do not bring it back): offset 0 → `Your week`; +1 → `Next week`; −1 → `Last week`; any other → the range label (`Oct 12 – 18`, `weekRange(...).label`).
- Away from the current week a small `This week` pill sits at the right end of the title row and jumps back to offset 0 (the mockup's pill). It is not drawn at offset 0. It must not push the title off centre (position it absolutely or mirror its width).
- The day strip shows that week's seven days; the "today" highlight only when today is in it; past days dim only before today.
- The card row shows that week's RSVP entries (same card, same rules). Empty: offset 0 keeps `Nothing on your week yet.`; another week reads `Nothing that week yet.`; `Find events` stays.
- Data: one calendar read per week (`from` = Monday 00:00 local, `to` = Sunday 23:59:59.999 local, as today), kept in a small cache keyed by the week's start so swiping back is instant; while a week's first read is out, the card row shows today's loading state. The home's refresh re-reads the week on screen. A failed read shows today's failure line for that week (Retry re-reads it).
- Accessibility: the week is also reachable without a swipe: two real buttons `Previous week` / `Next week` (they may be visually quiet chevrons at the ends of the title row, 44px targets, or visually hidden until focused; pick what keeps the row uncluttered and say which); the title row is an `aria-live="polite"` region that announces the week (`Next week, October 12 to 18`). `prefers-reduced-motion`: no slide animation.

## 2. The month sheet (R3_Month)

- Opens as a bottom sheet (the app's sheet, as `CardSheet` / `RsvpSheet` do: vaul, the scrim, the handle) when the title is tapped OR a day of the strip is tapped. A day tap opens it with that day selected; the title opens it on today (or on the Monday of the week on screen when today is not in it). The strip's old "tap a day scrolls the card row" behaviour is replaced by this.
- The sheet owns a history entry through `useLayerHistory` (src/lib/chat/use-layer-history.ts; contract 17.10 A): Back closes only the sheet.
- Content, top to bottom (take sizes and tokens from the mockup; Light and Night through `v2-tokens`, no hard-coded colour that breaks one theme):
  - `October` `2026` (the serif month, the muted year) and a `Today` pill at the right (jumps to the current month and selects today).
  - The weekday row `Mon … Sun` (Monday first, as the strip).
  - The month grid: each day a ≥ 40px target; a dot under a day with plans (coral when any is Going, grey when only Maybe: the strip's `dayDot` rule); today has the coral ring; the selected day is filled; days of other months are blank cells; past days dim.
  - Previous / next month: swipe the grid left / right (same swipe rule as the week) and two chevron buttons beside the month title; bounds as the week (the month holding −4 weeks to the month holding +26 weeks).
  - The selected day: `Fri, Oct 9` and a right-aligned caption (`Today`, `Tomorrow`, or nothing) with `· 1 plan` / `· 2 plans` / `· No plans`; then one row per plan, sorted by start: the event title, `<club name> · <7 PM>`, and the status pill (`Going` coral check, `Maybe`). A plan whose entry carries a `room_id` is a button that closes the sheet and opens its event chat (`onOpenRoom`, as a week card does); one without a room is not a button. No plans: `Nothing planned.` and the `Find events` link.
  - Footer line: `Only events you RSVP'd to`.
- Closing the sheet with a day of another week selected moves the strip to that week (so "tap a day → its plans" lands back on the right week).
- Data: one calendar read per month on screen (`from` = the grid's first Monday 00:00, `to` = its last Sunday 23:59:59.999), cached by month; a failed read shows the sheet's failure line with Retry; while loading, the grid draws without dots.

## 3. Rules

- Work only in `/private/tmp/claude-501/-Users-franciscocazares-vibe/3f2b2faf-e272-43a9-b45e-25788db6edb8/scratchpad/wave2` (branch `chat-week-nav`). Never touch `/Users/franciscocazares/vibe` (it is `main` = production). Do not commit or push. No SQL. Never production. A dev server of this worktree may be running on http://localhost:3101: do not start, stop or restart it; do not drive a browser (the orchestrator walks it).
- Pure logic goes in `src/lib/chat/week.ts` (for example `weekRangeAt(now, offset)`, `weekTitle(offset, range)`, `monthGrid(year, month)`, `monthBounds(now)`, a `swipeDirection(dx, dy)`) and `home/home-rules.ts` (the day's plan rows, the caption), each with `node --test` tests in the repo's style (`week.test.ts`, the home-rules tests). Time: the device's zone through the Date's local getters, calendar arithmetic (never +24h: a DST change falls on Nov 1, 2026, inside the window).
- Files: `src/lib/chat/week.ts` (+ test), `src/components/mobile/messages/home/home-rules.ts` (+ test), `home/YourWeek.tsx`, `home/MessagesHome.tsx`, a new `home/MonthSheet.tsx`, `v2-tokens.ts` only for a token that is missing (say which). Nothing else without saying why.
- Gates: `npx tsc --noEmit` exit 0; `npm test` all pass (baseline 1,814; report the new count); `npx eslint` on every changed file: no new error.
- Notes first: `handoffs/chat-redesign/wave-2-build/S71d-<role>-notes.md`, appended as you go; end with files changed, commands and results, what you could not do, and a walk list for the orchestrator (each step with the expected result).
