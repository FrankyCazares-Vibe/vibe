# Batch B8: the calendar (Oct 19, 2026)

Built on decisions 12 and 13 (coral key, "Interested", an event opens its club page at that event). Nothing committed. No database change, no Privacy Policy change, no production step.

## What changed

**D11, an even grid (My Calendar, `src/components/LeftNav.tsx`)**
- Seven equal columns (`repeat(7, minmax(0, 1fr))`), the weekday letters in their own row, and six rows of fixed 96px days. A long title can't widen its day any more.
- Two chips a day, then "+N more" (a button that picks the day). Each chip ends in "…" and has the whole title as its tooltip.
- The modal is `min(1040px, 100vw - 48px)` wide. A selected day gets a 2px ring drawn inside, so it never changes size.
- The mini calendar's columns are `minmax(0, 1fr)` too. Clicking a mini day now opens My Calendar on that day.

**D12, sync (`src/lib/calendar/calendar-sync.ts`, new)**
- `emitCalendarChanged()` fires the page's own `vibe:calendar-changed` event (as before) and posts `{ type: "calendar-changed", v: 1 }` on `BroadcastChannel("vibe-calendar")`.
  - A page that hears the channel fires its own event and never posts back, so there's no echo.
  - Two calls in the same tick count once. The desktop club panel used to reach it twice (the sheet and the shell); now that costs one read.
  - A hidden tab waits and reads once when it's looked at again.
- There's one channel per page (kept on `window`). It opens when the module loads, so pages that only listen (MessagesDesktop, ClubPane) hear other tabs too.
- `LeftNav.tsx` re-exports `CALENDAR_CHANGED_EVENT` and `emitCalendarChanged`, so every existing import still works.
- `RsvpSheet.tsx` `pick()` emits after a saved answer. This fixes the Otto-corner window, an iframe that couldn't reach the page's window event.
- My Calendar re-reads when you come back to the tab (focus or visibility), at most every 30 seconds. That covers an RSVP made on the phone.
- The badge counts upcoming entries only: still ahead, or still going on.
- An add or delete in the modal now emits, so other tabs and the week band hear it too.

**D13, the colour key (`src/lib/calendar/calendar-key.ts`, new, pure)**
- **Going:** solid coral, `--on-coral` words, a drawn check.
- **Interested:** a 1.5px coral outline with a faint coral wash (coral alone on white paper is 2.9:1) and ink words.
- **Yours:** a plain chip with a straight 3px bar in your colour, painted as a background stripe, so the rounded corner doesn't bend it into a bracket.
- Under the grid there's a key drawn with the chips themselves: Going / Interested / Yours, then "Click an event to open its club."
- The mini calendar has one mark per day: a coral dot for Going, a coral ring for Interested, a grey dot for Yours. Going wins.
- The route (`src/app/api/me/calendar/route.ts`) no longer sends `color` on RSVP entries; the client paints them by `viewer_status`. Personal entries keep their `color`.
- The personal colour presets lost green and amber. The near-black, which was invisible in Night, became a mid grey. The new default is blue, since coral now means an RSVP.
- An existing personal entry saved as `#1C1C1E` follows `--charcoal`, so it shows in both themes. A colour that isn't a plain hex falls back to grey.

**"Interested" everywhere (decision 12).** Only the word changed; the stored value stays `maybe`.
- `RsvpSheet` rows, `WeekBand`, `YourWeek`, `MonthBody`, `ClubRow`.
- `helpers.ts`: `rsvpWord`, `rsvpPill`, the spoken "you're interested", and `whoIsGoingLabel`.
- `EventAbout` ("· N interested"), `EventCardView`, `CardTray`, `ShareEventSheet` and `OttoUpcoming` (now "Going" / "Interested", where it used to say "RSVP'd" / "Maybe").
- `home-rules.ts`: the spoken labels say "you're interested" and "interested". A week card with no chat behind it is spoken as an "event", not a "room".

**D13, click-through**
- **Day cells:** a day is a plain block now. The day number is the button, and each event chip is a `Link` to `/orgs/<handle>?event=<id>` that closes the modal. A personal chip isn't a link.
- **Day panel:**
  - The title links to the club page at the event.
  - "Event chat" (`/messages?channel=<room_id>`) shows when the event has a chat.
  - The club name links to `/orgs/<handle>`.
  - A key chip says which kind the entry is.
- **The club page:**
  - New `src/app/orgs/[handle]/linked-event.tsx` has `useLinkedEvent` and `LinkedFlash`.
  - `OrgEventsSection` (upcoming) and `OrgPastEvents` (past) each report once their first read answers. The list that holds the event scrolls it to the middle of the screen, moves focus to it, and fades a coral ring in and out on `SPRING_SOFT`, opacity only.
  - If neither list has it, a toast says "That event isn't listed anymore." for 4.5 s.
  - A list whose read failed stays quiet.
  - `?event=` must be a uuid.
- **Club page on the phone:** `OrgContent.tsx` opens on the Events tab when `?event=` is set. Otherwise the card it scrolls to would be hidden.
- **Phone:** `YourWeek` cards and `MonthBody` rows that have a club but no chat link to the same club-page URL.
- **Desktop week band:** `WeekBand` cards and items do the same.

## Files

- **Owned by B8:**
  - `LeftNav.tsx`
  - `src/lib/calendar/calendar-sync.ts` and its `.test.ts`
  - `api/me/calendar/route.ts`
  - `RsvpSheet.tsx`, `YourWeek.tsx`, `MonthBody.tsx`, `WeekBand.tsx`
  - `OrgEventsSection.tsx`, `OrgPastEvents.tsx`
  - `club/helpers.ts` and its test, `club/EventAbout.tsx`, `cards/EventCardView.tsx`
- **New, in B8's area:**
  - `src/lib/calendar/calendar-key.ts` and its `.test.ts`
  - `src/app/orgs/[handle]/linked-event.tsx`
- **Outside the plan's list. No wave-2 batch owns these:**
  - `src/lib/chat/reads-routes.test.ts`: the calendar route's existing test lives there. Only the calendar case changed.
  - `src/app/orgs/[handle]/OrgContent.tsx`: the Events tab on the phone.
  - `home/home-rules.ts` and its test: the spoken words.
  - `home/ClubRow.tsx`, `compose/CardTray.tsx`, `compose/ShareEventSheet.tsx`, `otto/OttoUpcoming.tsx`: "Maybe" labels found by grep.
- **Handoffs, not applied:**
  - `B8-handoff-card-rules.patch` for B7. `cards/card-rules.ts` and its test say "you said maybe" in three spoken strings. The patch makes them "you're interested". `git apply --check` passes on the current tree.
  - `B8-handoff-profile-calendar.js` for B6's step 6 on `profile.html`. It's a paste-ready twin of the channel listener and emit (with the hidden-tab wait), the key CSS, `vibeCalKind`, `vibeCalBar` and `vibeCalHref`, plus the facts B6 needs. RSVP entries carry no `color` now. Until B6 adds the listener, an RSVP in the static profile's Otto corner won't refresh that page's calendar.

## Checks

- `node --test src/lib/calendar/*.test.ts`: 16 pass. That's 7 sync tests (one emit per tick, the channel fires the other page with no echo, listen-only pages, the hidden tab waits, no BroadcastChannel, message shape, the 30 s throttle) and 9 key tests (kinds and words, chip paint, no green/amber/fixed hex, hex check, the mini mark, upcoming badge, links, `?event=` parsing, how the two lists decide).
- The calendar route's test: RSVP entries carry `viewer_status` and no `color`.
- `helpers.test.ts` (16) and `home-rules.test.ts` (18) are updated for "Interested".
- `npm test`: 3467 / 3467 pass.
- `npx tsc --noEmit -p .`: no errors in B8 files. The 4 left are in B7's in-flight `delete-rules.test.ts`.
- `npx eslint` on all 25 touched files: clean.

## Browser check

Local dev, as blake (non-admin) and avery (owner). Every RSVP write was answered in the browser. `/api/me/calendar` was the real answer plus 8 synthetic rows: long titles, 4 on one day, Interested, Yours with blue, purple, coral, green and `#1C1C1E`. The mocked RSVPs changed that answer. No database writes. Scripts: `calendar/tools/b8-after/`.

- **My Calendar, 1440x900 and 1280x800, Night and Light:**
  - The modal is 1040 wide. All 42 days are 98.3px wide and 96px tall.
  - No chip leaves its day, and long titles end in "…". "+2 more" shows on the 4-entry day.
  - The grid ends at x=942, before the day panel at 960, so Friday and Saturday are fully visible.
  - No sideways scroll.
- **Mini calendar:**
  - The spoken day labels are right, for example "Wed Oct 21 2026, 1 going, 1 interested, 2 of yours".
  - The badge is 9. The ended Oct 15 RSVP isn't counted.
- **Sync (blake, 1440, both themes).** Each RSVP below caused exactly one My Calendar read in the main page, and the day's label changed to match:
  - On the /campus Events tab: one read.
  - From a second tab on the club page, where tapping Going again removed the RSVP: one read in the first tab.
  - Inside the Otto-corner window's event chat (Interested): one read in the parent page. This used to be zero.
  - From the /messages club panel dialog: one read, even though two places emit.
  - A focus right after a read: no re-read. A focus 31 s later: one.
- **Click-through:**
  - A chip on /campus opens `/orgs/test_open_club?event=…`. The modal closes, the card is in view, focused and ringed.
  - The ended "Chat Seed Game Night" lands on its Past events row, for blake and for avery (with "Who came").
  - A uuid that isn't listed shows the toast, which is gone 6 s later.
- **Phone, 390x844, iPhone UA, Night and Light:**
  - Your week cards without a chat are links ("…, you're going. Open the club page").
  - Tapping one opens the club page on the Events tab with the card ringed and focused. The page is 390 wide.
  - Month sheet rows for Oct 21 are links, 66px tall.
- **Desktop /messages week band:** cards without a chat link to the club page. The word "Maybe" no longer appears on the page.
- The red ring near the last click in some shots is the app's `CustomCursor`, not this batch.

Shots in `shots/`:
- `B8-modal-{night,light}-{1440,1280}.png`
- `B8-daypanel-{night,light}-1440.png`
- `B8-mini-{night,light}-1440.png`
- `B8-sync-mini-messenger-{night,light}-1440.png`
- `B8-orglink-{upcoming,past,owner-past,missing}-{night,light}-1440.png`
- `B8-weekband-{night,light}-1440.png`
- `B8-phone-{week,orglink,month}-{night,light}-390.png`

## For the main session

- **No database change, no Privacy Policy change, no production step.** Nothing new is kept or shown about anyone:
  - The calendar shows the viewer's own RSVPs and entries, as before.
  - The channel message carries no data.
  - `?event=` holds an event id only.
- **API shape:** `GET /api/me/calendar` RSVP entries dropped `color`. Only `LeftNav` used it. B6's static profile must paint by `viewer_status`.
- **"Interested" is longer than "Maybe".**
  - On the Up next cards (`club/UpNext.tsx`, not B8's), line 1 now cuts the time sooner ("Toni… · ● Interested"). Its doc comment still says "Maybe".
  - `MonthSheet.tsx:41`'s comment also still says "Maybe".
  - Both are comment-only follow-ups.
- **Old open tabs:** a tab still on the previous build would draw RSVP chips with no fill until it refreshes onto the new build. Build refresh handles that when the person comes back.
- **Not done (not asked):** the phone Messages home doesn't listen for `vibe:calendar-changed`. The plan didn't ask for it; it re-reads when you open it.

---

# Repair pass (Oct 19, 2026, later)

All 11 review findings were taken. None was rejected. Finding 1 is only partly B8's to fix, because `profile.html` belongs to B6. Nothing is committed. No database change, no Privacy Policy change, no production step. The one local database write was a clearly named test event, made and deleted through the app's own routes (see finding 4).

## What changed, by finding

1. **Desktop /profile calendar (decision 12): not met yet. B6 is building it.**
   - `profile.html` now has B6's in-progress `cal-real` block (`refreshCalendar`, `/api/me/calendar`, the key). It is uncommitted and B6's own work. B8 did not touch `profile.html`.
   - Fixed in the handoff (`B8-handoff-profile-calendar.js`), with three things B6's block still needs to stay a twin:
     - **Swatch.** Swap the New Event form's third swatch `#FF5C35` "Coral" for `#26A69A` "Teal".
     - **Colour mapping.** `vibeCalBar` maps a stored `#ff5c35` / `#f53` to `#5A9CFF`.
     - **Ink token.** `.cal-chip--yours` uses `var(--ink-post)`. The handoff's old `--ink-body` isn't defined in `profile.html`.
   - **Main session:** count decision 12 as not met on /profile until B6's block lands with those three changes.
2. **A private club's RSVP now links (`api/me/calendar/route.ts`).**
   - **Why it broke:** the route read the club through the viewer's own access, which hides a private club like SAE from non-members, so their RSVP came back with no club.
   - **The fix:** when the club comes back empty, the route reads its name, handle and verified flag with the service client, the way `/api/events` does.
   - **Hidden clubs:** the rule is unchanged. A hidden club is named only to its members, and they already get it from the viewer's read.
   - **Failures:** a failed read, or a missing service key, leaves the club empty. The route still answers normally (200), never with an error.
   - **New test** in `reads-routes.test.ts` (calendar section only):
     - a private club is named to a non-member;
     - a hidden club isn't;
     - an answer the viewer's read already had is kept;
     - one service read covers every unnamed club;
     - a failed read and a missing key both still answer 200.
   - **Not reproduced locally:** both local clubs that have RSVPs are public, so this rests on the test.
3. **No more "isn't listed" toast over an officer's own result.**
   - The rule moved into `createLinkedEventBoard()` in `calendar-key.ts`, and `useLinkedEvent` is now a thin wrapper around it.
   - Only the first settled answer may toast. Once a list has said `found`, or both lists have answered, the event is settled, and a later `missing` stays quiet. That later `missing` comes from Cancel, Delete or a 404.
   - Both lists join and leave the board as they mount and unmount. When both have left, the event is forgotten, so opening the same link again later still speaks.
   - **New test:** it drives the hook's own sequence, including found → missing (quiet), both missing (one toast, then never again), unknown then missing (quiet), a re-mount, a new visit and a second event.
   - **Browser:** as avery, the DELETE was answered `{notify_failed:true}`. After Cancel, "Event cancelled, but the notices didn't send" stays on screen and "isn't listed" never appears. Night and Light.
4. **The club page finds events My Calendar shows.**
   - **New `include` parameter on `/api/events`.** `/api/events?org_id=…&include=<event id>` adds that one event when it belongs to this club and fits the view asked for (upcoming: not ended; past: ended), whatever its date or the row cap.
     - It is read with the viewer's own access, so it is only ever an event they could already see.
     - The hidden-club rule, club names and counts apply to it as to every other row.
     - A failed read leaves the list as it was.
     - `src/app/api/events/route.ts` is "no batch" in the plan. The change sits in the club-page branch only, and the docblock explains it.
   - Both club lists pass the page's `?event=` as `include`. The past list now asks for the route's full 20 rows (it asked for 10).
   - **Not changed on purpose:** My Calendar still reads 180 days ahead. Cutting it to 60 would hide a January formal from your own calendar.
   - **3 new tests in `events-list-route.test.ts`:**
     - an upcoming event 88 days out and a past event beyond the 20 rows are added, each in its list's order;
     - `include` is ignored when the list already has the event, when the id isn't valid, on the campus list and for a hidden club;
     - a failed read keeps the list.
   - **Browser:** as avery, I made "B8 repair test, delete me" (chat_seed_club, Jan 15 2027) through `POST /api/events`.
     - As blake, `/orgs/chat_seed_club?event=<id>` at 1440 and 390, both themes: the card is found, in view and focused, with no toast.
     - The same list without `include` doesn't have it.
     - Deleted through `DELETE /api/events/<id>` (200). Afterwards it is gone, even with `include`.
5. **My Calendar fits 1366x768 and 1280x720.**
   - **Rows:** the month draws only the rows it needs (most months are 5). The rows share the modal's height, at least 64px each, and the modal is `min(800px, 100vh - 48px)` tall.
   - **The key:** it sits outside the scroller, so it is always on screen.
   - **Chips:** each day shows as many chips as its row holds, up to 2, then "+N more".
   - **New helper:** `src/lib/calendar/month-layout.ts`, with 3 tests: rows per month, row height, and chips per height.
   - **Measured in the browser, as blake, Night and Light:**

     | Screen | Month | Row height | Chips on a day | Key (top to bottom) |
     |---|---|---|---|---|
     | 1440x900 | Oct | 122px | 2 + "+2 more" | 812-832 |
     | 1366x768 | Oct | 106px | 2 + "+2 more" | 706-726 |
     | 1366x768 | Jan 2027 (6 rows) | 87px | a 4-entry day: 1 + "+3 more" | 706-726 |
     | 1280x800 | Oct | 112px | 2 + "+2 more" | 738-758 |
     | 1280x720 | Oct | 96.5px | 2 + "+2 more" | 658-678 |
     | 1280x720 | Jan 2027 (6 rows) | 79px | a 4-entry day: 1 + "+3 more" | 658-678 |

     - The last row always ends exactly at the scroller's bottom, with no scrolling and nothing outside its day.
6. **The phone's Up next shows the time whole.**
   - Line 1 ends in the key's mark only: a coral check for Going, a coral ring for Interested. The word is the mark's tooltip, and the card's spoken label already said "you're going" / "you're interested". The doc comment now gives the new widths.
   - **Measured at 375, both themes:** "Tomorrow · 7:30 PM · ○" and "Tonight · 9:30 PM · ✓" are 150 of 150 with the time not cut (the screenshot shows room to spare).
7. **One key on every calendar.**
   - New `home/RsvpMark.tsx`:
     - `RsvpDayMark`: a coral dot for Going, a coral ring for Interested;
     - `InterestedRing`: the ring before the word.
   - **Where it is used:**
     - the week band (`WeekBand`);
     - the phone week strip and week cards (`YourWeek`);
     - the month grid and its plan pills (`MonthBody`). The Interested pill is now a coral outline with ink words; Going stays the filled pill;
     - `ClubRow`;
     - Up next.
   - `MonthSheet`'s comment is updated.
   - **Browser:** Sat 24 (Interested only) has a coral ring in the week band, the phone strip and the month sheet, matching the left-nav mini calendar. Wednesday (Going + Interested) is a solid coral dot. Every "Interested" word has the ring.
8. **Coral isn't a personal colour.**
   - The swatches are now blue, purple, teal, pink and grey. They moved to `calendar-key.ts` (`PERSONAL_COLOR_PRESETS`), and `LeftNav` uses them from there.
   - `barColor` maps a stored `#FF5C35` / `#F53` (the old default, still the database's and the personal-events route's fallback) to the new default blue.
   - **Tests:** the "never looks like an RSVP" test loops over every swatch and every older colour. A new test checks that coral isn't offered and that old coral turns blue.
   - **Browser:** "Run club" (saved `#FF5C35`) now has a blue bar, and the New Event form shows the 5 new swatches.
9. **The linked card keeps a focus mark.**
   - `outline: none` is gone from both wrappers. `LinkedFocusStyle` draws a 2px coral outline, offset 3px, for as long as the wrapper has focus. It uses `:focus` because the wrapper is only ever focused by the page itself. The flash still fades.
   - **Browser:** 4 s after load, at 1440 and 390 in both themes, focus is on the card with `solid 2px rgb(255, 92, 53)`.
10. **The Otto-corner home and Otto's Upcoming follow RSVPs.**
    - **The window's own home:** `MessagesHome` (the phone home, which is also the Otto-corner window's home) re-reads the week on `vibe:calendar-changed`. The listener lives in the component, not in `useHomeData`, because MessagesDesktop runs its own copy of that hook, which would mean two reads per change.
    - **Otto's Upcoming:** the new `otto/use-upcoming-follows-calendar.ts` re-reads `/api/me/otto` and swaps in only the Upcoming rows. Only the newest read lands, and an answer whose Upcoming part failed is ignored. It's used in `OttoPageClient` and `OttoMobile`.
    - **Browser, blake, both themes:**
      - An Interested tap on /campus Events with the corner window open on its home gave 1 week read in the window, and Oct 20 went from "going" to "interested".
      - On /otto, an RSVP in the /campus tab gave 1 `/api/me/otto` read, and the Upcoming row changed.
11. **Only the newest My Calendar read lands.**
    - `readSeqRef` covers the first load and every re-read.
    - A re-read that overtook the first load and failed now shows the failure with Retry, instead of loading forever.
    - **Browser:** two changes 300 ms apart, with the first read answering 2.5 s late. The day ends with the RSVP gone ("Tue Oct 20 2026"), not "1 going".

## Files (this pass)
- **Changed:**
  - `src/app/api/me/calendar/route.ts`
  - `src/app/api/events/route.ts` (no batch owns it)
  - `src/lib/chat/reads-routes.test.ts` (calendar section only; B7's lines there are untouched)
  - `src/lib/events/events-list-route.test.ts`
  - `src/lib/calendar/calendar-key.ts` and its test
  - `src/app/orgs/[handle]/linked-event.tsx`, `OrgEventsSection.tsx`, `OrgPastEvents.tsx`
  - `src/components/LeftNav.tsx`
  - `club/UpNext.tsx`
  - `desktop/messages/WeekBand.tsx`
  - `home/YourWeek.tsx`, `MonthBody.tsx`, `MonthSheet.tsx` (comment only), `ClubRow.tsx`, `MessagesHome.tsx`
  - `otto/OttoPageClient.tsx`, `mobile/OttoMobile.tsx`
- **New:**
  - `src/lib/calendar/month-layout.ts` and its test
  - `home/RsvpMark.tsx`
  - `otto/use-upcoming-follows-calendar.ts`
  - scripts in `calendar/tools/b8-repair/`
- **Updated handoff:** `B8-handoff-profile-calendar.js`.
- None of these is a file B1, B6, B7 or B10 owns.

## Checks (this pass)
- `node --test src/lib/calendar/*.test.ts`: 21 pass.
- `reads-routes.test.ts`: 20 pass. `events-list-route.test.ts`: 10 pass.
- `npm test`: 3507 / 3507 pass.
- `npx tsc --noEmit -p .`: no errors.
- `npx eslint` on all 23 touched source files: clean.

## Shots (this pass, `shots/`)
- `B8r-modal-{night,light}-{1440x900,1366x768,1280x800,1280x720}.png`
- `B8r-modal-6rows-{night,light}-{1366x768,1280x720}.png`
- `B8r-swatches-{night,light}-1440.png`
- `B8r-focus-{night,light}-{1440,390}.png`
- `B8r-cancel-toast-{night,light}-1440.png`
- `B8r-orglink-far-{night,light}-{1440,390}.png`
- `B8r-weekband-{night,light}-1440.png`
- `B8r-phone-week-{night,light}-390.png`
- `B8r-phone-month-{night,light}-390.png`
- `B8r-upnext-{night,light}-375.png`
- `B8r-corner-home-{night,light}-1440.png`
- `B8r-otto-upcoming-{night,light}-1440.png`

## Privacy (this pass)
Nothing new is kept, and nothing new is shown about people.
- The calendar now names the club behind your own RSVP even when it's private and you aren't a member. `/api/events` already shows that same name ("by SAE") to everyone who can see the event.
- `include` returns one event the viewer can already see. The past list's extra 10 rows carry the same "N were there" counts, with the from-5 floor.
- The Otto re-read is the payload the page already loaded.
- No Privacy Policy change.

## Stale lines above (superseded by this pass)
- "Up next … comment-only follow-ups": fixed (finding 6).
- "Not done: the phone Messages home doesn't listen": done (finding 10).
- "RSVP entries carry no `color` … B6 must paint by `viewer_status`": still true. Also see finding 1's three changes.
