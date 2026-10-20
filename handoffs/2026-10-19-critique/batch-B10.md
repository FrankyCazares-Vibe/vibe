# B10: door screen tidy (Oct 19, 2026)

Status: built, tested, browser-checked. Not committed. No database change, no Privacy Policy change, no production step.

## What was sloppy (seen in the browser before the change, `shots/B10-was-*.png`)
1. **Done twice on the open door.** One in the header, one again beside Stop check-in. Both went to the same place.
2. **A non-officer had two exits to the same place.** The header Done and "Go to the event" both linked to the event's card.
3. **The "before" screen said "an hour before the event" twice.** "You can start check-in from an hour before the event." followed by "Check-in opens at 9:57 PM, an hour before the event." It used the device's clock while the student's check-in page uses campus time, and it never named the day, so a link opened the night before still said "opens at 7:00 PM".
4. **"Check-in has ended." / "Nobody has checked in yet."** There is no "yet" after the end.
5. **Small layout things.**
   - The code "4812" sat about 4.5px left of the QR's centre on a phone, because the letter spacing also trails the last digit.
   - "Scan with your phone's camera, or type the code in Vibe." left "Vibe." alone on its own line, on the phone and the desktop.
   - The header Done was 40px tall, under a full touch target.
   - The white QR tile had no edge on Light's cream.
   - A long event title was cut to one line with "…".

## What changed
- NEW `src/components/events/checkin/door-screen.ts` (pure, no React):
  - `doorScreen(...)`: which of the 8 screens shows (loadFailed, notOfficer, loading, failed, before, start, open, after). It's the same order DoorView used before.
  - `doorExits(screen, hasClub)`: the one-exit rule.
    - Anyone who can run check-in gets the header's Done on every screen, the same spot before and after Start.
    - A non-officer gets "Go to the event" and no Done.
    - "See who came" shows only after the end, and only when there's a club page.
  - `doorOpensLine(opensAtMs, nowMs)`: in campus time. "Check-in opens at 6:00 PM.", "...tomorrow at 6:00 PM." or "...Thu, Oct 22 at 6:00 PM.". Null for a time that doesn't parse.
  - `doorAfterLine(count)`: "7 were there" or the new `DOOR_NOBODY_CAME`, "Nobody checked in.".
- NEW `door-screen.test.ts`: 12 tests.
  - Every screen has exactly one way back to the event, with or without a club.
  - Officers keep Done on every screen, and Start to open doesn't move it.
  - The screen order.
  - The opens line: today, tomorrow, another day, 9:30 PM campus time when UTC is already the next day, "tomorrow" across the Nov 1 clock change, and NaN.
  - No "yet" after the end.
  - Source checks on DoorView.tsx:
    - `CHECKIN_COPY.done` appears once, inside the `exits.headerDone` branch.
    - No `doneHref`, and one "Go to the event".
    - No emoji. The only typed colour is the QR tile's `#fff`.
    - Springs come from `@/lib/motion/springs`.
- `src/components/events/checkin/DoorView.tsx`:
  - The body comes from `doorScreen`, and the links from `doorExits`. OpenDoor lost its Done and its `doneHref` prop, so only Stop check-in sits under the count.
  - The header Done is 44px tall, can't shrink, and isn't drawn for non-officers.
  - The before screen reads, in bold, "Check-in opens at 10:03 PM." (campus time, with the day when it isn't today), then "You can start check-in from an hour before the event."
  - The after screen uses `doorAfterLine`.
  - The title gets two lines before the "…".
  - The code gets `marginRight: -0.12em`, so it's centred.
  - The CSS: `.vibe-door p { text-wrap: balance }`, and the QR tile gets a `0 0 0 1px var(--hairline)` ring.
  - The local `timeLabel` (device clock) and the `opensAtLine` import are gone. Everything uses theme tokens, with why-comments dated Oct 19, 2026.
- `src/app/campus/checkin/[id]/door/page.tsx`: read it and left it unchanged. Nothing on the page itself needed changing.
- The shared copy in `src/lib/events/event-checkin.ts` is unchanged (it isn't B10's file). The two new lines are local to door-screen.ts.

Focus is unchanged: after Start it moves to Stop, after Stop to Start, and to the header Done when neither is drawn.

## Checks
- `node --test src/components/events/checkin/door-screen.test.ts`: 12/12 pass.
- `npm test`: 3412/3412 pass, including the check-in tests.
- `npx eslint` on DoorView.tsx, door-screen.ts, door-screen.test.ts and the door page: clean.
- `npx tsc --noEmit -p .`: no errors in B10 files. The only errors are TS5097 in `src/lib/calendar/calendar-key.test.ts` and `calendar-sync.test.ts` (B8's in-flight files).

## Browser check (local dev; door feed answered in the browser, every write stubbed)
- Event: "Chat Seed Game Night" (chat_seed_club).
  - The door route's GET, POST and DELETE were answered by `page.route`.
  - All other non-GET calls were stubbed in the page (only the heartbeat fired).
  - Nothing reached the database.
- Who:
  - **blake** (member, non-admin) for the not-officer screen.
  - **avery** (owner) for the officer screens, since the door is owners and admins only.
- Sizes and themes: 390x844 (iPhone user agent) and 1440x900, Night and Light, dev badge hidden.
- Measured:
  - **Open:** one Done (298,17, 76x44 on the phone; 1124,17 on desktop) and Stop alone below. No page scroll sideways at 390.
  - **Member:** "Go to the event" only, no Done.
  - **After, with a club:** Done plus "See who came" (different places).
  - **Focus at 1440:** Start then focus on "Stop check-in"; Stop then focus on "Start check-in"; one Done.
  - **Sideways phone 844x390:** the QR is 242px and ends at y 349, Stop ends at 358. Nothing is under the fold.
  - **Long title** (swapped in the page only): two lines with "…", 50px tall, with Done centred beside it.
- Shots in `shots/`:
  - After: `B10-{open,start,before,after,after-nobody,member}-{390,1440}-{night,light}.png`, `B10-open-390-longtitle-{night,light}.png`, `B10-open-844x390-night.png`.
  - Before the change: `B10-was-{open,start,before,after,member}-{390,1440}-{night,light}.png`.
- Scripts: `door/tools/door-shots.mjs <prefix>` and `door/tools/focus-check.mjs`.

## For the main session
- **Database:** none. **Privacy Policy:** none. Nothing new is shown or kept about anyone: the door's count is the same number officers already saw. **Production:** nothing beyond the normal deploy.
- **Left as is, Franky's call (small):** after the end with 0 check-ins, the screen reads "Nobody checked in." and still offers "See who came". I kept the link because it opens the officers' list, where they can still mark Going and Interested people as here for a day after the end. If the wording bothers him, the label could change to something like "Mark who came" (shared copy, event-checkin.ts).
- **Not checked live:** the "Couldn't load check-in." screen (it needs an event read to fail). Its code path only changed by name: Done and Try again, as before.

## Repair round (Oct 19, 2026, after the adversarial review)

Status: all six findings fixed (5 in B10's files, 1 as a patch). Not committed. No database change, no Privacy Policy change, no production step.

### What changed
1. **No code left on the open door (30 to 60 s of bad signal).**
   - Before: a bare white square, the scan line still showing, and "Reconnecting…" floating under the whole page.
   - Now the tile keeps its size, turns a faint tint of the page (`rgba(var(--scrim-rgb), 0.05)`, dashed edge) and says "Reconnecting…" (or "Getting the code…" when no read has failed) inside.
   - The scan line hides until there is a code to scan.
   - While codes still show, "Reconnecting…" sits in OpenDoor's column under the countdown. The page-level line now skips the open door (`screen !== "open"`).
2. **The open door fits a portrait phone in Safari.**
   - Under 760 px wide, the open door is one screen tall (`.vibe-door.is-open { height: 100dvh }`).
   - The QR's box starts at the old size (`min(78vw, 420px)`) and shrinks to the height that's left, never under 160 px. The tile is the box's smaller side (`container-type: size`, `min(100cqw, 100cqh)`). So it adapts to a one- or two-line title on its own.
   - Under 740 px tall, the column's gaps tighten (10 to 6) and the code shrinks with the height (`clamp(56px, min(20vw, 11dvh), 128px)`).
   - The title keeps its two lines.
   - 390x844, 1440x900 and the sideways 844x390 are unchanged (same QR sizes and positions).
3. **0 check-ins after the end.** The link reads "Mark who came" (`DOOR_MARK_WHO_CAME`, `doorWhoCameLabel`), and "See who came" from 1 up. `DOOR_NOBODY_CAME` is now "Nobody checked in", with no full stop, like "7 were there".
4. **The feed's refusal.** `doorScreen` takes `failCode`. With no feed, a failed read and `org_role_required`, the door draws the not-officer screen: "Only the club's owner and admins can run check-in.", "Go to the event", no Done, no Try again. The read still retries once a minute, so a restored role brings the door back by itself. Other refusals keep "Couldn't load check-in." with Try again.
5. **The student's page names the day.** It's a patch, not applied: `handoffs/2026-10-19-critique/B10-opens-line.patch` (`git apply --check` passes).
   - door-screen.ts now exports `checkinOpensWhen` ("at 6:00 PM", "tomorrow at 6:00 PM", "Thu, Oct 22 at 6:00 PM"). `doorOpensLine` is built on it.
   - The patch makes `opensAtLine(when)` say "Check-in opens tomorrow at 6:00 PM, an hour before the event." and wires CheckinLanding to it.
   - Rejected part of the fix: moving the helper INTO event-checkin.ts. It needs campus-time.ts, which imports "@/...", and six or more test files load event-checkin.ts with no "@/" resolve hook, so they would all break. The helper stays in the pure door-screen.ts, and event-checkin.ts keeps only the wording.
6. **The Start lead.** It's the door's own now (`DOOR_START_LEAD`): "People check in by scanning the QR code or typing the 4 numbers next to it. Both change every 30 seconds."
   - "next to it" is true in both layouts.
   - "4 numbers" keeps the students' own words. "4-digit" broke at its hyphen on the desktop.
   - No-break spaces keep "QR code" and "4 numbers" whole on the phone.
   - The same patch updates the shared `doorStartLead` to match. After it, that shared key is unused, so it can be deleted. CONTRACT.md:1324 still has the old words.

### Files
`DoorView.tsx`, `door-screen.ts`, `door-screen.test.ts` (12 to 19 tests), `door/tools/door-shots.mjs`. New: `B10-opens-line.patch`.

New door-shots cases:
- `refused` (avery, door answers 403 org_role_required)
- `stale` (one good read whose steps end 4 s later, then 500s, shot at 8 s)
- `reconnecting` (one good read, then a 500 at the 10 s poll, codes still on screen)
- `open-short` (390x664, 375x553)
- `open-short-long` (390x664, 375x553, 320x568 with a long title)

### Checks
- `node --test src/components/events/checkin/door-screen.test.ts`: 19/19.
- `npm test`: 3467/3467.
- eslint on DoorView.tsx, door-screen.ts, door-screen.test.ts and the door page: clean.
- `npx tsc --noEmit -p .`: no B10 errors. The only errors are in `src/components/mobile/messages/delete-rules.test.ts` (B7's in-flight file).
- Patch: event-checkin.test.ts passes on a patched scratch copy, except its one check that reads campus-home.tsx, which can't run outside the repo. tsc and eslint on the patched CheckinLanding were not run.

### Browser (local dev, door route answered in the browser, every other write stubbed: only the heartbeat fired, nothing reached the database)
Shots are `shots/B10r-*.png` in Night and Light.

| State | Size | QR | Stop ends at y |
|---|---|---|---|
| Open, short title | 390x664 | 304 px | 644 |
| Open, long title | 390x664 | 286 px | 648 |
| Open, short title | 375x553 | 213 px | 537 |
| Open, long title | 375x553 | 188 px | 537 |
| Open, title on two lines | 320x568 | 201 px | 552 |
| Open | 390x844 | 304 px at y 162 (unchanged) | |
| Sideways (focus-check.mjs) | 844x390 | 242 px | 358 |
| Stale | 390 | 304 px placeholder with "Reconnecting…" inside | |
| Stale | 1440 | 414 px placeholder; "3 checked in" and Stop beside it | |

- No sideways scroll at any size.
- **Reconnecting at 1440:** "Reconnecting…" sits under "New code in 11 s", beside the QR.
- **Refused:** the same screen as the member's, at 390 and 1440.
- **After, nobody:** Done, "Nobody checked in", "Mark who came".
- **Focus (focus-check.mjs):** after Start it moves to Stop, after Stop to Start. One Done.
