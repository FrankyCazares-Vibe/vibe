# Map 02: the inbox home and Your week (for desktop Messages)

Read Oct 3, 2026, in the worktree `scratchpad/chatdesk` (branch `chat-desktop`, same as main). Read-only. Every path is repo-relative. `home/` means `src/components/mobile/messages/home/`, `messages/` means `src/components/mobile/messages/`.

The old notes (`handoffs/s72-prep/notes/desktop-chat.md`, `handoffs/s72-prep/desktop.md`) were checked against the code. Their line references for this area still hold. Three things they got wrong or missed are in section 5 (traps 1, 2, 3).

**Short answer.** The data engine, the rules and the two row components can be reused. The four containers cannot: `MessagesHome`, `YourWeek`, `MonthSheet` and `ComposeOverlay` are each built around the phone's page (one scrolling column, the tab bar, bottom sheets, a full-screen overlay). Desktop needs four new containers that sit on the same engine. No new route is needed for the wide list, the slim list, the band or the month.

---

## 1. What exists

### 1.1 The engine: `useHomeData` (`home/MessagesHome.tsx:77-300`)

A hook, **not exported** (plain `function useHomeData`, line 77). It owns the three reads and their timers.

- Signature: `useHomeData(refreshKey: number, onThreads: (threads: ThreadEntry[] | null, requests: ThreadEntry[] | null) => void)`.
- Returns (`:282-299`): `threads`, `requests`, `threadsErr`, `clubs`, `clubsErr`, `week` (the cards of the week on screen, null while loading), `weekErr`, `now` (one clock for the whole list), `range` (the week on screen), `weekOffset`, `weekSlide`, `setWeekOffset(n)`, `stepWeek(+1 | -1)`, `refreshWeek(range)`, `retryLists()`, `retryWeek()`.
- Reads (`:120-151`, `:167-181`):
  - `GET /api/me/threads?scope=chats` and `GET /api/me/inbox`, together, `cache: "no-store"`, quiet.
  - `GET /api/me/calendar?from=<Monday 00:00>&to=<Sunday 23:59:59.999>` for the week on screen (`calendarUrl`, `home-rules.ts:437`).
- Timers:
  - Lists: every 30 s while the tab is visible, counted from the LAST list read (`LIST_RESYNC_MS`, `:56`, `:110-117`); on return to visible at most once per 30 s (`:242-250`); again whenever `refreshKey` changes (`:210-215`).
  - Week: one read per week, cached by the week's Monday (`:84`, `:167-181`); re-read when older than 5 min (`WEEK_RESYNC_MS`, `:57`, `:184-190`), on return to visible, and at once on `refreshKey` or `refreshWeek` (`:200-206`, `:219-227`). Never on the 30 s timer.
  - Week bounds: 4 weeks back, 26 ahead (`week.ts:93-94`, `clampWeekOffset` `:97`).
- Failure rules: a first-load failure is kept as `threadsErr` / `clubsErr` / the week's own `failure`; a refetch failure keeps the rows and stays quiet (`:140-150`, `:174-180`).
- It never marks anything read. Unread is whatever the two list routes say.

### 1.2 The phone home: `MessagesHome` (`home/MessagesHome.tsx:327-574`)

- Props (`:59-71`): `filter`, `onFilter`, `refreshKey`, `onThreads`, `onOpenClub(orgHandle, roomId, roomKind)`, `onOpenThread(threadId)`, `onOpenRoom(roomId, orgHandle | null)`, `onCompose()`.
- Draws, top to bottom: header with `Messages` and a pencil button (`:431-469`); `YourWeek` (`:471-484`); the filter row All / Chats / Clubs / Requests with the two counts (`:486-551`); the list (`:553-555`); the month sheet when open (`:557`); a fixed 36px fade above the tab bar (`:559-571`).
- The list switch is inline (`:360-425`): skeleton until both lists answered; Requests = `ThreadRow`; Chats = `PersonRow`; Clubs = `ClubRow` or `HomeEmpty`; All = `mergeHomeRows` of both.
- The month's open and close logic is inline too (`:346-358`): on close the strip moves to the picked day's week and that week is read again.
- **There is no search on the phone home** and no "New" button with a label (a pencil only). Contract 11.1: "Not in v1: search".
- Mounted only by `MessagesMobileV2` (`src/components/mobile/MessagesMobile.tsx:526-535`). It stays mounted under an open chat, so the 30 s list read keeps running while a chat is open.

### 1.3 The rules: `home/home-rules.ts` (pure, no React; tested in `home-rules.test.ts`)

| Function | What it gives | Line |
|---|---|---|
| `HomeFilter`, `HOME_FILTERS`, `parseHomeFilter`, `homeUrl` | the four filters, `?tab=` in and out | 21-33 |
| `mergeHomeRows(clubs, threads)` → `HomeRow[]` | All: pinned first (newest pin first), then recency, stable | 35, 49-72 |
| `isMuted(mutedUntil, now)` | muted right now | 75 |
| `clubHasUnread(club)` | `board.unread || lounge.unread_count > 0` | 80 |
| `allBadgeCount(threads, clubs, now)`, `badgeText(n)` | the All pill's number, muted left out, `99+` | 89, 96 |
| `clubPreview`, `clubChip`, `newCountText`, `clubRowLabel`, `clubRowTime` | the club row's lines and label | 109, 125, 137, 187, 203 |
| `personPreview`, `personRowLabel` | the person row's line and label | 221, 242 |
| `WeekEntry` (type), `rsvpEntries(body)`, `calendarUrl(from, to)` | the calendar read's address and its parsed `rsvp` entries | 251, 447, 437 |
| `entriesOn(day, entries)`, `dayDot`, `dayLabel` | a day's events, its dot, its spoken label | 264, 271, 283 |
| `weekCardLine(e, now, otherWeek)`, `weekCardLabel(e, now)` | `Live now` / `Ended` / `Fri 7 PM`; the card's spoken label | 300, 314 |
| `spokenDay`, `dayHeading`, `planCountText`, `dayCaption`, `dayWhen`, `isPastDay`, `monthDayLabel`, `planRows` | every word of the month | 331-416 |
| `sheetReturnFocus(opener, fallback, openingRoom)` | where focus goes when the month closes | 430 |

### 1.4 The calendar arithmetic: `src/lib/chat/week.ts` (pure; `week.test.ts`)

`weekRange(now)` `:48`, `weekDays(start)` `:70`, `isSameLocalDay` `:79`, `WEEK_MIN_OFFSET` / `WEEK_MAX_OFFSET` `:93-94`, `clampWeekOffset` `:97`, `weekRangeAt(now, offset)` `:103`, `weekOffsetOf(now, day)` `:113`, `startOfLocalDay` `:118`, `dayDiff` `:123`, `weekTitle` `:128` (`Your week` / `Next week` / `Last week` / `Oct 12 – 18`), `weekSpoken` `:136`, `weekWord` `:142`, `swipeDirection` `:159`, `isTap` `:174`, `sheetStartDay` `:180`, `MonthRef`, `monthOf`, `addMonths`, `compareMonths`, `monthName`, `monthBounds`, `clampMonth` `:186-218`, `monthGrid(year, month)` `:232` (cells Monday first, plus the read's `from` / `to`).

### 1.5 The time labels: `src/lib/chat/when.ts` (pure; `when.test.ts`)

`rowTime` / `rowTimeSpoken` `:138-145` (`8:44 PM`, `Yesterday`, `Wed`, `Oct 5`), `eventTime` `:166`, `eventTimeShort` `:171` (`7:30 PM`, `Fri 7 PM`, `Oct 8 7:30 PM`), `isSoon` `:190`, `eventWhen` / `eventWhenSpoken` `:203-216`, `moreDays` `:219`. Device zone for the screens; the campus zone only for stored fallback text.

### 1.6 The phone week block: `YourWeek` (`home/YourWeek.tsx:124-376`)

- Props (`:137-157`): `entries`, `failure`, `onRetry`, `now`, `range`, `offset`, `slide`, `onStep(+1|-1)`, `onThisWeek()`, `onOpenMonth(day | null, opener)`, `onOpenRoom(entry)`, `titleRef?`.
- Draws a vertical block: a centred title (a button that opens the month, `:226-235`); a seven-day strip of 44×44 buttons spread edge to edge (`justifyContent: "space-between"`, `:270`); then a sideways-scrolling row of 142×64 cards (`:349-373`) or the empty line `Nothing on your week yet.` + `Find events` (`:335-347`) or a failure box (`:325-328`) or three grey cards (`:329-334`).
- `Previous week` / `Next week` are real buttons but drawn only while one has keyboard focus (`StepButton`, `:384-407`, used at `:221` and `:240`). A `This week` pill appears away from the current week (`:241-255`).
- The swipe: `useSwipe` (`:55-86`), pointer events, spread on the title row + strip (`:216`) and on the empty and loading rows.
- Also exported: `SLIDE_CSS` (`:33-39`), `slideClass` (`:42`), `useSwipe`. `WeekCard` (`:424-523`) and `StepButton` are private.

### 1.7 The phone month: `MonthSheet` (`home/MonthSheet.tsx:85-280`)

- Props (`:63-76`): `initialDay`, `opener`, `now`, `night`, `onClose(picked)`, `onOpenRoom(entry)`, `returnFocusTo?`.
- A vaul bottom sheet (`Drawer.Root`, `:174`), 580px tall, at most 88dvh (`:190-191`), with a drag handle that is also the Close button (`CloseHandle`, `:294-322`).
- Inside: month title, `Today` pill, two chevrons (`MonthHeader`, `:325-384`); weekday letters; the grid with dots (`:229-257`); the picked day and its plans (`DayPlans`, `:391-489`); the line `Only events you RSVP'd to`.
- One calendar read per month on screen, cached while open (`readMonth`, `:115-132`), address from `monthGrid(...).from/.to`.
- Calls `useHideTabBar()` (`:86`) and `useLayerHistory(true, close)` (`:109`: it pushes one history entry so Back closes the sheet).
- `MonthHeader`, `DayPlans`, `CloseHandle` and all the state are private to the file.

### 1.8 Rows and empty states

- `ClubRow({ club: InboxClub, now, onOpen(roomId, roomKind) })` `home/ClubRow.tsx:23-233`. A full-width button: 48px avatar, name, time, preview line, chip line, `N new`. Opens the Board when the Board is unread and the Lounge has nothing new, else the Lounge (`:37`, `:66`). Exports `CheckIcon` (`:246`).
- `PersonRow({ thread: ThreadEntry, now, onTap })` `home/PersonRow.tsx:25-143`. A full-width button: 44px avatar (a group's double disc), name, time, pin icon, preview, a coral pill when unread. Exports `PinIcon` (`:146`). `PersonAvatar` (`:168`) and `Disc` (`:195`) are private.
- `HomeEmpty()` `home/HomeEmpty.tsx:18-116`: `Your clubs will live here.` + two links to `/campus?tab=orgs`.
- `messages/ThreadList.tsx`: `TabPill` `:8` (old list only), `ThreadRow({ thread, onTap })` `:65-206` (the Requests rows; old look, 50px avatar), `ListSkeleton()` `:208`, `EmptyState({ tab: "all" | "requests" })` `:255-308`.
- Avatars: `clubGradient(id)`, `personColor(id)` (`messages/avatar.ts:49-56`), `initialsOf`, `threadTitle`, `threadAvatar` (`messages/format.ts:18-44`).

### 1.9 New message: `ComposeOverlay({ onCancel, onPick(handle) })` (`messages/ComposeOverlay.tsx:21-301`)

A full-screen layer (`position: fixed; inset: 0; z-index: 1200`, `:122-124`). Shows suggested people (`GET /api/me/suggested-connections?limit=20`, `:67`) and a search (`GET /api/users/search?q=&limit=20`, debounced 220 ms, `:95`). Picks ONE person. The shell turns the handle into a DM (`openDmByHandle`, `MessagesMobile.tsx:425-449`: an existing thread from the list, else `POST /api/me/threads { handle }`). **It cannot make a group chat.**

### 1.10 Tokens and theme

- `palette(night): Palette` `messages/v2-tokens.ts:142`, with `SERIF` / `FONT` `:18-20`. Page, ink, secondary, muted, surface and hairline are CSS variables (`:76-81`, `:109-114`); the rest are literals per theme.
- `useNightTheme(): boolean` `messages/theme.ts:22-28`: reads `data-theme` on `<html>`, re-renders on the theme event. Server snapshot is `false` (Light).

### 1.11 The three routes the home calls

| Route | Gate | Shape | Evidence |
|---|---|---|---|
| `GET /api/me/threads?scope=chats` | signed in only; **not** behind `chat_v2` | `{ ok: true, threads: ThreadEntry[], requests: ThreadEntry[] }`; dms and groups only; pinned first, then newest; each has `unread: boolean` (no count), `pinned_at`, `muted_until`, `is_request`, `members`, `peer`, `last_message` | `src/app/api/me/threads/route.ts:417-427`, `:486`, `:780-783`, `:823-837`, `:846-855`, `:888-892`; type `:62-90` |
| `GET /api/me/inbox` | **404 `not_found` unless `chat_v2` is on for the person** | `{ ok: true, clubs: InboxClub[] }`; per club: `org`, `viewer_role`, `board { room_id, latest, unread }`, `lounge { room_id, latest, unread_count ≤ 99 }`, `next_event`, `last_activity_at`, `pinned_at`, `muted_until` | `src/app/api/me/inbox/route.ts:79-81`, `:302-328`; types `src/lib/chat/types.ts:381-402` |
| `GET /api/me/calendar?from=&to=` | signed in only; the three room fields are null unless `chat_v2` is on | `{ ok: true, entries: CalendarEntry[] }`; `rsvp` entries carry `org_id`, `room_id`, `room_state`; `personal` entries too (the home drops them) | `src/app/api/me/calendar/route.ts:65-81`, `:116-139`, `:171`; `types.ts:409-413` |

Read marking, for the record: the home marks nothing. A room is marked read by `useRoomPoll` (`src/lib/chat/use-room-poll.ts:238-241`, `POST /api/me/threads/[id]/read`, the active room only); a phone DM by `ConversationView.tsx:195`; a desktop DM by `public/html/messages.html:2573` (once, when the thread opens) and by the server when you send (`src/app/api/me/threads/[id]/messages/route.ts:535-551`).

---

## 2. Reusable on desktop AS IS

Safe means: no fixed width, no `100vw` / `100dvh`, no safe-area padding, no `position: fixed`, no touch-only gesture, no tab-bar or history code.

| Piece | Why it is safe |
|---|---|
| The three routes of 1.11 | None looks at the device. Shapes are typed and pinned. |
| `home/home-rules.ts` (all of it) | Pure. No React, no DOM (`:1-6`). |
| `src/lib/chat/week.ts`, `src/lib/chat/when.ts` | Pure. Every function takes `now`. |
| `useHomeData` | No layout in it at all: three reads, two timers, a visibility listener (`MessagesHome.tsx:77-300`). **Needs the word `export` added** (or a move to its own file). That is the only change. |
| `ClubRow` | A `width: 100%` button inside an `<li>` (`ClubRow.tsx:63-82`). Text lines ellipsize (`minWidth: 0`). Works at any column width; checked against the board's 520px list. |
| `PersonRow` | Same shape (`PersonRow.tsx:41-60`). |
| `ThreadRow` (Requests) | Same shape (`ThreadList.tsx:94-110`). Old look, CSS variables only, so it follows Night. |
| `HomeEmpty`, `EmptyState` | Centred blocks that grow to fill a flex column (`HomeEmpty.tsx:28`); links only. |
| `HomeSkeleton` | Five grey rows (`MessagesHome.tsx:308-322`). **Not exported**; needs `export` or a 15-line copy. |
| `palette`, `SERIF`, `FONT`, `useNightTheme` | Size-independent. See 2.1. |
| `clubGradient`, `personColor`, `initialsOf`, `threadTitle`, `threadAvatar`, `CheckIcon`, `PinIcon` | Pure helpers and two SVGs. |
| `LoadFailed`, `asLoadFailure`, `vibeRequest` | Already used on desktop (`src/components/LeftNav.tsx:10-15`, `:467`). |
| `SLIDE_CSS`, `slideClass` | A keyframe string and a class name (`YourWeek.tsx:33-44`). Fine for the band's week change. |

### 2.1 Do the tokens work in Light and Night at desktop size? Yes, with two cautions

- The six base tokens are CSS variables that both themes define: `--cream`, `--charcoal`, `--ink-2`, `--ink-muted`, `--paper`, `--hairline`, `--scrim-rgb`, `--ink-sub`, `--cream-92` (`src/app/globals.css:59-65`, `:114-115` for Light; `:146-154`, `:190-191` for Night). Nothing in `palette()` depends on a width.
- `useNightTheme` reads `<html data-theme>` (`messages/theme.ts:22-28`), which every page carries since S68. The old desktop iframe already paints on `var(--cream)` (`src/app/messages/MessagesSwitch.tsx:56`).
- Caution 1: **the approved board is Night only and written in literals** (`#0C0B0B`, `#F6F1EA`, `#CFC8BE`, `#9C958C`, `#161515`, `rgba(255,255,255,0.10)`; `handoffs/chat-redesign/boards/D3_Tuck.dc.html:69-74`, `:112-113`). No Light board of D3 exists. The build must map each literal to a token: `#0C0B0B` → `t.page`, `#F6F1EA` → `t.ink`, `#CFC8BE` → `t.secondary`, `#9C958C` → `t.muted`, `#161515` → `t.surface`, `rgba(255,255,255,0.10)` → `t.fieldBorder`, `rgba(255,255,255,0.12)` → `t.chipBorder`, `rgba(255,255,255,0.05 / 0.045 / 0.035)` → `rgba(var(--scrim-rgb), same)`, the live chip → `t.liveCard`, `#FF8A66` → `t.coralText` / `t.coralMark`. Light is then whatever the tokens give; it has to be walked.
- Caution 2: the board uses `font-variation-settings: 'SOFT' 100` on every Fraunces title (`D3_Tuck.dc.html:70`). The app does not load that axis (`src/app/layout.tsx:96`; contract 11.0 "is NOT used"). Do not copy it.

---

## 3. Phone-shaped: what needs a wrapper or a desktop twin

### 3.1 `MessagesHome` → a desktop twin (wide list). Cannot be mounted as is.

Why not:
- Its root is a page: `minHeight: calc(100dvh - 64px - env(safe-area-inset-bottom))` (`MessagesHome.tsx:430`). The 64px is the phone's tab bar. It has no inner scroll; the whole page scrolls.
- The header pads for the notch (`:435-436`).
- It mounts `YourWeek` inside itself (`:471`). On desktop the week is a band above the whole Messages area, outside the list.
- It mounts `MonthSheet` inside itself (`:557`).
- The bottom fade is `position: fixed; left: 0; right: 0; bottom: calc(64px + …)` (`:559-571`). On a laptop it would span the window, left nav included, 64px above the bottom.
- No search, no labelled "New" button.

Smallest way:
1. Add `export` to `useHomeData`, `HomeSkeleton`, `FILTER_LABEL`, `LIST_LABEL` (`MessagesHome.tsx:77`, `:308`, `:324-325`). Four keywords, no behaviour change on the phone.
2. New desktop component (wide list): its own header (`Messages`, search, `New`), its own filter row, its own list switch (about 70 lines, the same branches as `:360-425`), built from `ClubRow`, `PersonRow`, `ThreadRow`, `EmptyState`, `HomeEmpty`, `mergeHomeRows`, `allBadgeCount`, `badgeText`. The list area gets `overflowY: auto` in a column of fixed height.
3. **The hook must live in the desktop shell, not in the list.** The band, the wide list and the slim list all read the same data, and the wide list is hidden while a chat is open. One `useHomeData` call in the shell; its result goes down as props.

Small visual deltas when the phone rows sit in the desktop list (board vs code): the board draws no hairline between rows (`border-bottom: 1px solid transparent`, `D3_Tuck.dc.html:126`), the phone rows draw one (`ClubRow.tsx:110`, `PersonRow.tsx:69`); the board pads rows 8px inside a 16px gutter (`:122-123`), the phone rows pad 14 / 16px themselves (`ClubRow.tsx:73`, `PersonRow.tsx:51`); the rows have no hover or focus style (inline styles only). All three can be handled from the wrapper (a `<style>` with `li > button:hover` on the list, as `YourWeek` does with `SLIDE_CSS`) without touching the row files.

### 3.2 The slim list → new component. Nothing like it exists.

Data, from functions that exist, no new route:
- Order: `mergeHomeRows(d.clubs ?? [], d.threads ?? [])` (`home-rules.ts:49`). Same order as the wide list, so a row does not jump when the list tucks.
- Pinned: `row.club.pinned_at` / `row.thread.pinned_at` (`types.ts:397`; `messages/types.ts:45`).
- Unread: `row.thread.unread` (`messages/types.ts:40`) or `clubHasUnread(row.club)` (`home-rules.ts:80`).
- Keep a row when pinned, or unread, or it is the open chat.
- The dot: coral for `thread.unread` or `club.board.unread`; the board draws a hollow ring when only the Lounge has new messages (`D3_Tuck.dc.html:252`, label `New in the Lounge`). The brief says "a plain coral dot if unread". See question 3.
- The open row shows no dot (the board fades it: `slimSalsaDot`, `slimMayaDot`, `D3_Tuck.dc.html:622-624`). Needed in code too, because the list data is up to 30 s old.
- Avatar 26px: `club.org.logo_url` or `initialsOf(org.name)` on `clubGradient(org.id)`; a person by `personColor` + `initialsOf`; a group's double disc must be redrawn (the phone's `PersonAvatar` is private and fixed at 44px, `PersonRow.tsx:168-193`).
- Name: `club.org.name` or `threadTitle(thread)` (`messages/format.ts:28`).
- Label: `clubRowLabel` / `personRowLabel` already say "unread", "pinned" and the time (`home-rules.ts:187`, `:242`).
- Sizes on the board: column 232px, row 44px, "Messages" control 36px in a 64px header (`D3_Tuck.dc.html:243-252`).

The open chat is not always in the two lists. Four cases the component must handle: a request (it is in `d.requests`, not `d.threads`); an event chat (highlight its club's row; the club comes from the room's resolve, `room.org`); a club room of a club the inbox does not list (the inbox needs both a Board and a Lounge row, `inbox/route.ts:110`); a brand-new DM from `?to=` before the next list read. Rule to write down: the open chat always has a row; when the lists do not hold it, the shell supplies its name and avatar from what it opened.

### 3.3 `YourWeek` → a desktop twin (the band). Cannot be reshaped by props.

Why not:
- It is a vertical block about 150px tall (`YourWeek.tsx:118`); the band is one row, 76px, folding to 44px (`D3_Tuck.dc.html:69`, `:610`).
- The title is centred and alone (`:220`); the band's title is at the left with a small chevron (`D3_Tuck.dc.html:70`).
- The arrow buttons exist but are invisible until keyboard focus (`:384-407`). The band needs them always drawn (28px, `D3_Tuck.dc.html:73-74`).
- The day strip spreads its seven days across the full width (`justifyContent: "space-between"`, `:270`). At 1,240px that is 200px between days. The band packs them (`gap: 2px`, `D3_Tuck.dc.html:76`).
- The cards are 142×64, three lines, in a sideways scroller with a fade mask (`:349-367`, `:446-449`). The band's cards are 50px tall, two lines (`Fri 7 PM · ✓ Going` / `Fright Night  Film Society`, `D3_Tuck.dc.html:86-97`). `WeekCard` is private and the wrong shape.
- The coral bloom is placed by measuring the live card (`:175-193`, `:209`), tuned for 375px. The band lights the live card with a box-shadow and has no bloom (`D3_Tuck.dc.html:86`).
- Swipe handlers on the strip (`:216`) also answer a mouse drag (`:61`). Not wanted on desktop: the arrows do it.

Smallest way: a new band component with two faces (full and folded), fed by the shell's `useHomeData`:

| The band needs | Comes from |
|---|---|
| the week's events | `d.week` (null = loading), `d.weekErr`, `d.retryWeek` |
| which week | `d.range`, `d.weekOffset`; title by `weekTitle(offset, range)`; spoken by `weekSpoken` |
| the arrows | `d.stepWeek(-1)` / `d.stepWeek(1)`; disabled at `WEEK_MIN_OFFSET` / `WEEK_MAX_OFFSET` |
| back to this week | `d.setWeekOffset(0)` (the phone's `This week` pill; the board does not draw it, see question 6) |
| the seven days | `weekDays(d.range.start)`; per day `entriesOn`, `dayDot`, `dayLabel`, `isPastDay`, `isSameLocalDay(d.now, day)` |
| a card's first line | `weekCardLine(e, d.now, d.weekOffset !== 0)` → `Live now` / `Ended` / `Fri 7 PM` |
| a card's label, RSVP mark | `weekCardLabel(e, d.now)`, `e.viewer_status`, `CheckIcon` |
| the club's name on a card | `e.org?.name` (null when the club is gone) |
| is the card a link | `e.room_id !== null` → `/messages?channel=<room_id>` |
| the folded line | the same entries: `weekCardLine(...).text` + `e.title` per event |
| the slide when the week changes | `d.weekSlide` + `slideClass` + `SLIDE_CSS` |
| the day the month opens on | from the title: `sheetStartDay(d.now, d.range)`; from a day: that day |

Copy to keep: `Nothing on your week yet.` / `Nothing that week yet.` + `Find events` → `/campus?tab=events` (`YourWeek.tsx:337-343`); the group label `Event rooms you RSVP'd to <this week>` (`:354`; the board says `Event chats you RSVP'd to this week`, `D3_Tuck.dc.html:85`: pick one, see question 7).

### 3.4 `MonthSheet` → a popover on desktop. The shell is phone-shaped; the inside is reusable but locked in the file.

Why the sheet cannot be used as is:
- `vaulContentStyle` pins it to the bottom of the window, full width (`messages/sheet-styles.ts:8-20`), 580px tall (`MonthSheet.tsx:190`). On a laptop that is a 1,440px-wide bar.
- The handle is a drag bar (`:294-322`); the grid is marked `data-vaul-no-drag` (`:229`).
- `useLayerHistory(true, close)` pushes a history entry (`:109`). That stack belongs to the phone shell's `popstate` owners (`src/lib/chat/use-layer-history.ts:31-44`).
- `MonthHeader` renders `Drawer.Title` (`:368`). Outside a `Drawer.Root` that throws, so the header cannot be lifted out unchanged.
- `useHideTabBar()` (`:86`) is harmless on desktop (the class only acts under 900px, `globals.css:2857-2880`) but has no purpose there.

What is reusable inside: the month state (`picked`, the month on screen, the per-month cache, `readMonth`, `go`, `goToday`, `retry`; `:89-171`), the weekday row, the grid (`:229-257`), the picked-day header (`:261-264`), `DayPlans` (`:391-489`), the footer line (`:268-274`). All of the words come from `home-rules.ts`.

Two ways, pick one (question 4):
- **A. Split the file** into a body (`useMonthData` + `MonthBody`, the title element passed in) and the phone's sheet around it; desktop wraps the same body in a popover. One copy of the calendar logic. Costs an edit to a phone file that was walked on Oct 2 (contract 17.11), so the month's phone walk is repeated.
- **B. A desktop copy** (about 200 lines) that imports only `home-rules.ts` and `week.ts`. No phone file changes. Two copies of the same grid from then on.

Either way the popover's own rules are new: anchored under the band's title (the round-1 board put it at 308px wide, radius 20, on the surface colour: `handoffs/chat-redesign/boards/D_A_Month_Night.dc.html:388`), Esc and a click outside close it, focus returns by `sheetReturnFocus`, and closing runs the same three lines as the phone (`MessagesHome.tsx:353-358`: move the band to the picked day's week, read that week again).

### 3.5 `ComposeOverlay` → a centred dialog on desktop.

Why not as is: `position: fixed; inset: 0` over the whole window, left nav included (`ComposeOverlay.tsx:122-127`); a phone header with `Cancel` (`:143-159`); it sets `body.vibe-composer-open` with its own boolean (`:42-45`). The row (`ComposeUserRow`, `:303`) is private.

Smallest way: a desktop dialog that calls the same two routes (`:67`, `:95`) and hands a handle to the shell. The shell's handle-to-DM step is private to the phone shell (`MessagesMobile.tsx:425-449`), about 20 lines to repeat: look in `d.threads` for a dm with that peer handle, else `POST /api/me/threads { handle }`, then bump `refreshKey` and open `?channel=<id>`.

### 3.6 Pieces that are fine but carry phone habits

- `EmptyState` says "Search for someone in Network and tap message" (`ThreadList.tsx:286`). "tap" on a laptop. Copy only.
- `YourWeek`'s card link and any copy of it: `e.preventDefault()` on every click (`YourWeek.tsx:506-511`). On desktop a Cmd-click or a middle click should open a new tab. A desktop card must cancel only a plain left click.
- Rows are `<button>`s, the board draws `<a href>` (`D3_Tuck.dc.html:123`, `:248`). A button cannot be opened in a new tab. Fine for the wide rows; for the slim list and the band's cards, links are the better fit (the address is `/messages?channel=<id>` anyway).

---

## 4. Contracts the desktop build must not break

### 4.1 Types

- `ThreadEntry` (`messages/types.ts:21-56`): `unread?`, `pinned_at?`, `muted_until?`, `is_request?` are optional on the client type. Read them with `!!` / `?? null` as the rows do.
- `InboxClub`, `InboxResponse` (`src/lib/chat/types.ts:381-402`); `EventRef` (`:41-52`); `CalendarRoomFields` (`:409-413`).
- `WeekEntry` (`home-rules.ts:251-261`) is the home's own copy of a calendar `rsvp` entry. `rsvpEntries` is the only parser (`:447-469`).
- `HomeFilter` (`home-rules.ts:21`) is the home's own name. Never widen `Tab` in `messages/types.ts:141` (contract 11.0, SPLIT-M2).
- `MessagesHomeProps` (`MessagesHome.tsx:59-71`): the phone shell passes exactly these (`MessagesMobile.tsx:526-535`). Do not change them.
- `FeaturesResponse = { ok: true; chat_v2: boolean }` (`types.ts:178`). The phone's reader checks `body.chat_v2 === true` and nothing else (`src/lib/chat/use-chat-v2.ts:26-28`), so one more field on the body is safe.

### 4.2 Route shapes and gates

- The three shapes of 1.11. Do not add a required param, do not rename a field.
- `GET /api/me/calendar` with no params is also what "My Calendar" in the left nav reads (`src/components/LeftNav.tsx:467`, `:488`). Its default window (30 days back, 180 ahead, `calendar/route.ts:76-81`) and its `personal` entries must stay.
- `GET /api/me/threads` with no `scope` is still read by the old desktop page, the chat bubble and the phone's old list. It lists club rooms and leaves event chats out (`threads/route.ts:486`). Unchanged.
- `GET /api/me/inbox` answers 404 `not_found` without `chat_v2` (`inbox/route.ts:79-81`). A screen that meets that 404 shows `LoadFailed`, never the old list (contract 2.1).

### 4.3 URLs

- `/messages`, `/messages?tab=chats|clubs|requests`, `/messages?channel=<id>`, `/messages?to=<handle>` (contract 2.3). `parseHomeFilter` and `homeUrl` (`home-rules.ts:26-33`) are the two functions for `?tab=`; tested (`home-rules.test.ts:76`).
- The server page passes only `to` and `channel` (`src/app/messages/page.tsx:26-35`). The phone reads `tab` itself with `useSearchParams` (`MessagesMobile.tsx:214-215`).
- Push and Otto links point at `/messages?channel=<id>` (contract 2.3). The week cards carry the same address as their `href` (`YourWeek.tsx:504`).

### 4.4 Flag rules

- Fail closed: a failed flag read means the old screen (`use-chat-v2.ts:20-22`).
- While the flag is unknown, show a skeleton. Never one list and then the other (contract 2.1).
- With the desktop switch off, the desktop branch of `MessagesSwitch` (`src/app/messages/MessagesSwitch.tsx:39-67`) must render today's iframe unchanged. The phone branch (`:28-37`) is not touched.
- Switches are server env values, never `NEXT_PUBLIC_` (`src/lib/chat/flag.ts:10-16`; pinned by `flag.test.ts:98`). They count only on the live site and in `next dev` (`flag.ts:46-48`; `flag.test.ts:60`).

### 4.5 Timing

- Lists every 30 s while visible, the week every 5 min at most (contract 11.1; `MessagesHome.tsx:56-57`). Desktop must not add a faster list read. The old desktop page polled the list every 30 s too (`public/html/messages.html:1791`).

### 4.6 Copy the tests and contract 1.2 pin

- The club row's `Board:` prefix, `N new`, `Live now · <title>`, `Going` / `Maybe`, and the labels `unread Board post`, `N new in the Lounge` (`home-rules.ts:113-138`, `:187-200`; `home-rules.test.ts:120`, `:162`, `:179`).
- `Your week` / `Next week` / `Last week` / the range; `Nothing on your week yet.`; `Find events` (`week.ts:128-133`; `week.test.ts:151`).
- The month's words (`home-rules.test.ts:300-360`).
- If point 11 calls the Board "Announcements" anywhere in the list, these strings and their tests change together. The brief keeps the chip named Board and titles only the panel section "Announcements", so the rows keep `Board:`.

### 4.7 Tests that pin behaviour (run by `npm test` = `node --test` over every `src/**/*.test.ts`, `package.json:11`)

| File | Tests | Pins |
|---|---|---|
| `home/home-rules.test.ts` | 17 (`:76-387`) | filters and URLs, the All order, the badge, both previews, every label, the week card line, the month's words, focus return, the calendar address and parser |
| `src/lib/chat/week.test.ts` | 20 (`:21-243`) | week and month arithmetic through both DST changes, the bounds, the titles, swipe and tap thresholds |
| `src/lib/chat/when.test.ts` | 12 (`:51-149`) | every time label |
| `messages/avatar.test.ts` | | the gradient and colour picks |
| `src/lib/chat/threads-list-route.test.ts` | 4 (`:203-266`) | how the thread list reads previews |
| `src/lib/chat/flag.test.ts` | 17 flag tests (`:52-185`) | the switch and its lists |
| `src/lib/chat/use-room-poll.test.ts` | | reads the SOURCE TEXT of `use-room-poll.ts` and `club/RoomChips.tsx` (`:16`, `:130`): a harmless-looking edit there can fail a test |

New desktop rules (which rows the slim list keeps, which dot, what the band shows when cards do not fit) should be a pure `.ts` file with its own `.test.ts`, loaded the same way: no React import, `@/` alias through the repo's resolve hook.

### 4.8 The phone must not change

Any edit under `home/` has to leave the phone's output identical. Adding `export` to four names does. The month split (3.4 A) does only if the sheet renders the same nodes; it needs the month's phone walk again.

---

## 5. Traps

1. **The desktop's own switch still needs `chat_v2` on the server.** `GET /api/me/inbox` is 404 without it (`inbox/route.ts:79-81`) and the calendar's room fields are null without it (`calendar/route.ts:116-139`), so the band's cards would be plain tiles that open nothing. The old notes list these routes as "reusable with zero change" and stop there. A person with the desktop switch on and `chat_v2` off would get a home with no clubs. The switch has to mean "`chat_v2` for this person AND desktop on" (question 1).
2. **Group chats can only be created on the old desktop page.** `messages.html:2962` posts `{ type: 'group', name, members }`. The phone's compose picks one person (`ComposeOverlay.tsx:26`, `:293`), and no file under `src/components/mobile` posts `type: "group"`. If desktop "New" becomes a DM-only dialog and `messages.html` runs in thread-only mode, nobody on the new desktop can start a group chat. The old notes missed this (question 8).
3. **The inbox does not see the Officers room or any extra room.** `groupClubRooms` keeps only `board`, `lounge` and `event` rows (`src/lib/chat/reads.ts:122-128`); unread and `last_activity_at` are computed from those (`inbox/route.ts:290-315`). A new message in an exec-only room does not light the club's row, does not light the slim dot, does not move the club up. Point 11 makes those rooms first-class on desktop, so this silence shows (question 9).
4. **The desktop tree is the one the server renders** (`src/lib/use-is-mobile.ts:36-38`), and `useNightTheme` answers Light on the server (`messages/theme.ts:26`). Anything that uses a palette literal (the active chip, today's day chip, the live card) would paint Light for a frame in Night. The phone avoids it because the home mounts only after the flag request. Desktop must do the same: until the desktop flag answers, draw a skeleton made of CSS variables only.
5. **One `useHomeData`, in the shell.** If the wide list and the slim list each call it, every 30 s costs four reads and the two lists disagree by up to 30 s.
6. **`onThreads` must be a stable callback.** `readLists` depends on it (`MessagesHome.tsx:118-151`) and the mount effect depends on `readLists` (`:210-215`). An inline arrow re-runs the reads on every render: a loop.
7. **`refreshKey` is the only way to get fresh lists before the 30 s timer.** The shell must bump it when a chat is closed or switched, a DM is created, a request is accepted or declined, a chat is pinned, muted, hidden or left. On desktop the DM thread is an iframe and the parent hears nothing from it today: the only message it posts is the cursor (`messages.html:1112-1128`). Thread-only mode needs a "my lists changed" message to the parent.
8. **A DM left open becomes "unread" again.** The old page marks read once, when the thread opens (`messages.html:2573`); its 2 s poll does not (`:2576-2579`); the server marks on send (`messages/route.ts:535-551`). A message that arrives while the DM is open flips `unread` in the next list read. The slim list hides the open row's dot, but the All badge counts it, and the dot appears the moment you switch away from a chat you were looking at. Thread-only mode should mark read when a poll brings new messages while the tab is visible.
9. **The old page erases `?channel=` from the address** after it opens a thread (`messages.html:3661-3668`, `__vibeTopReplaceState`). In thread-only mode that would wipe the address the slim list and deep links read. Must be off there.
10. **The old page keeps its own list timer** (`messages.html:3671-3674`) on the unscoped `/api/me/threads`, the heaviest read. Hidden inside a thread-only iframe it would still run. Must be off there.
11. **Two calendars on one screen.** "My Calendar" (left nav) and the band both read `/api/me/calendar` and know nothing of each other. The only bridge is `CALENDAR_CHANGED_EVENT` (`LeftNav.tsx:18-23`, listener `:507-514`), and today only Campus sends it (`src/app/campus/campus-home.tsx:9995`, `:10500`, `:10549`). An RSVP made in the chat (the club panel, an event card) does not send it, and `useHomeData` does not listen for it. Without both halves, one calendar shows "Going" and the other does not until a reload.
12. **The month's day chip is a fixed 42×42** (`MonthSheet.tsx:249`) in seven equal columns with 12px side padding. In the round-1 popover (308px) a column is 40.6px, so chips overlap. The popover must be at least 320px wide or the chip takes a size.
13. **The band runs out of room.** Title about 110px + arrows 60 + seven days 320 + gaps: about 540px before any card. The shell leaves `window − 200px` (`globals.css:2774-2778`): 700px at the 900px minimum, so room for one card or none. The board's cards shrink (`flex: 0 1 auto; min-width: 0`, `D3_Tuck.dc.html:86`); five events crush each other. The phone solved this with a sideways scroller, which the band does not have. It needs a written rule (question 7).
14. **Do not copy the fixed bottom fade** (`MessagesHome.tsx:559-571`) into a desktop column: it is `position: fixed` across the window.
15. **`useLayerHistory` inside any reused sheet pushes a history entry.** The stack answers `popstate` itself (`use-layer-history.ts:76-78`). A desktop shell with its own `popstate` handler must ask `isLayerPop(e)` first, or Back on an open popover is read as "close the chat". Simplest: desktop popovers and dialogs do not use the layer stack at all (Esc and an outside click close them).
16. **"Pinned" already means something.** Today it is a pinned CONVERSATION: `channel_members.pinned_at`, set by `POST /api/me/threads/[id]/pin` (`src/app/api/me/threads/[id]/pin/route.ts:8-12`), sorted first by both list routes. Point 10 adds pinned MESSAGES. The slim list is "Pinned and unread chats" (`D3_Tuck.dc.html:247`). The contract must give the two different names in code and in copy.
17. **The new screens have no door to pin a conversation.** Contract 11.1: "Not in v1: mute/pin/hide from the new list". The only callers of the pin route are the phone's old action sheet (`messages/ConversationActionSheet.tsx:61`) and the old desktop page (`messages.html:3268`). A club's pin is the pin on your Lounge row (`inbox/route.ts:323`), reachable only from the old lists where the Lounge shows as a thread. So the "pinned" half of the slim list is fed only by old pins unless thread-only mode keeps the DM menu and the club header gains a pin. Say which in the contract.
18. **Week cards swallow every click** (`YourWeek.tsx:506-511`). A desktop copy must let Cmd-click and middle click through.
19. **Requests rows tell time differently**: `ThreadRow` uses `relativeTime` with `Date.now()` (`5m`, `2h`; `ThreadList.tsx:90`, `messages/format.ts:3-16`), every other row uses `rowTime` with the list's one clock (`8:44 PM`). Already so on the phone; more visible in a wide list.
20. **A person's unread has no number.** The route sends a boolean (`threads/route.ts:780-783`). The phone draws an empty 20px coral pill (`PersonRow.tsx:121-136`); the board draws a small dot under the time. Do not promise a count.
21. **On a phone the desktop branch renders for one frame** before `useIsMobile` flips (`use-is-mobile.ts:46-52`). Today that frame starts loading the iframe. With the new page, check that the desktop flag read and the three list reads do not fire on phones during that frame.

---

## 6. Open questions for the planner (each with a recommended answer)

1. **What does the desktop switch mean on the server?**
   Recommend: desktop is on for a person when `chat_v2` is on for them AND a new env switch is on (its own allow-list if a founders-only stage is wanted). `GET /api/me/features` gains one field, `chat_v2_desktop: boolean`. No gated route changes; the phone never reads the new field. This keeps "the phone never waits for desktop" and avoids trap 1.

2. **How does desktop get the home's data?**
   Recommend: add `export` to `useHomeData`, `HomeSkeleton`, `FILTER_LABEL`, `LIST_LABEL` in `home/MessagesHome.tsx` (four keywords). The desktop shell calls `useHomeData` once and passes the result to the band, the wide list and the slim list. Do not move the hook to a new file in this build: an export is the smallest change to a walked phone file.

3. **The slim list's dot: coral only (the brief), or coral plus a hollow ring for "only new Lounge messages" (the approved board, `D3_Tuck.dc.html:252`)? And muted chats?**
   Recommend: follow the board. Coral = an unread DM or group, or an unread Board post. Hollow ring = only new Lounge messages. The row's label says which. A muted chat with unread is not listed unless it is pinned or open, the same rule the All badge uses (`home-rules.ts:89-93`). Put the rule in a pure, tested function.

4. **The month: split `MonthSheet` (one copy of the logic, a phone file edited) or write a desktop copy (no phone edit, two copies)?**
   Recommend: the split, done alone in the first batch, with the phone's month walk repeated before anything else builds on it. Two copies of a calendar drift, and the month was already changed twice in one week. If the planner wants zero phone edits before Oct 26, take the copy and note the debt.

5. **What does Search search?**
   Recommend: the rows already loaded, by name, on the client: club name, person name, group name and group members' names. The old desktop page does exactly this (`filterT`, `messages.html:1636`). No route. The magnifier opens a field in the header; Esc clears it. People you have no chat with are found through "New".

6. **Away from the current week, what does the band show, and does opening a chat reset the week?**
   Recommend: the title follows `weekTitle` (`Next week`, `Oct 12 – 18`), and a small `This week` button sits after the arrows when the offset is not 0 (the phone has it, `YourWeek.tsx:241-255`; the board never drew another week). Opening a chat folds the band and keeps the week. The folded line shows the week on screen.

7. **What happens when the cards do not fit the band (many events, or a narrow window)?**
   Recommend: cards keep a minimum width; the band shows as many as fit and then one `+N` chip that opens the month on that week. Under about 1,000px of window the cards go first; the title, arrows and days stay. This needs one more picture at 900 to 1,100px before it is built; the board was drawn at 1,440 only. Also choose one group label: `Event chats you RSVP'd to this week` (board) or `Event rooms…` (phone). Recommend the board's "Event chats", since "event chat" is the name used everywhere else on screen.

8. **Does "New" on desktop make group chats?**
   Recommend: yes. One dialog: pick one person for a DM, or several for a group with an optional name. The server side exists (`POST /api/me/threads` with `{ type: "group", name, members }`, `threads/route.ts:24-35`, `:220`). Without it, switching desktop on removes the only place a group chat can be started (trap 2).

9. **Should a new message in the Officers room or an extra room light the club's row?**
   Recommend: yes, and it is a small change to an existing route, not a new one. `InboxClub` gains one optional field (for example `other_unread: boolean`: some other room I hold a row on has a newer top-level message from someone else), computed in `GET /api/me/inbox` next to the two counts, and those rooms count toward `last_activity_at`. The wide row and the slim dot use it. Under `chat_v2` the phone row can use it too (the brief allows new room rules where the new chat is on). Without it, exec-only chats are silent on the home (trap 3). The rooms reader (point 11) should confirm which kinds exist first.

10. **How do the band and "My Calendar" stay in step?**
    Recommend: the desktop shell listens for `CALENDAR_CHANGED_EVENT` and calls `d.refreshWeek(d.range)`; every RSVP made inside desktop Messages calls `emitCalendarChanged()` (`LeftNav.tsx:19`) after it succeeds. Both are a few lines and neither touches the phone.

11. **Pinning a conversation on the new desktop (the slim list's "pinned").**
    Recommend: keep the DM's pin in the old thread's own menu in thread-only mode, and add "Pin club" / "Unpin club" to the club header's menu, calling the existing `POST /api/me/threads/<lounge room id>/pin`. In the contract, call this "pin a chat" and call point 10 "pin a message", in code and in copy (traps 16, 17).

12. **Requests on desktop: restyle the rows?**
    Recommend: no. Keep `ThreadRow` as the phone does (contract 11.1). The request's Accept and Decline live in the thread pane; after either, the pane tells the shell and the shell bumps `refreshKey` (trap 7).

13. **Small visual differences between the phone rows and the board's rows** (row hairlines, 8px inner padding, hover, the unread mark for a person as a dot under the time).
    Recommend: accept the phone rows as they are in this build and add hover and focus styles from the wrapper. No row file is edited, so the phone cannot change. Revisit after the walk if Franky minds the hairlines.

14. **The slim list when many chats are pinned or unread.**
    Recommend: no cap; the column scrolls. Order is the wide list's order (`mergeHomeRows`), so nothing jumps when the list tucks.

15. **Light theme.** There is no Light board of the approved direction.
    Recommend: no new board. Build from the tokens (2.1), then walk Light at 1,440 and 1,100px next to Night and fix by eye.
