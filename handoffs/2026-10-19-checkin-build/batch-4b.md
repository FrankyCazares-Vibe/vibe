# Batch 4b: officer card wiring

Owner files (contract section 8, Batch 4, part 4b):
`src/components/events/checkin/StartCheckinAction.tsx`,
`src/components/events/checkin/HereToggle.tsx`,
`src/app/campus/campus-home.tsx` (4.1's three edits and 4.2 only),
`src/app/orgs/[handle]/OrgPastEvents.tsx`,
`src/app/orgs/[handle]/page.tsx` (the `eventsColumn` mount only).

## Log

- Contract read in full; batch-3.md, batch-4a.md and batch-2.md notes read.
- Dev server: nothing listens on :3000 at the start of this batch (curl 000,
  `lsof` empty). Not started, per the rules.
- Written: `StartCheckinAction.tsx`, `HereToggle.tsx`, `OrgPastEvents.tsx`;
  campus-home.tsx 4.1 (type fields, `<CheckinSlot ev={ev} />` under the
  RSVP row, `<StartCheckinAction ev={ev} />` after Manage attendees) and
  4.2 (exported `AttendeesModal`, `Attendee = EventAttendee`, split lists,
  `here` prop, Clear check-ins with ConfirmDialog, 20 s re-read while the
  mark window is on); page.tsx eventsColumn fragment.

## Choices worth knowing

- **Pills are 32 px tall** (contract 4.0's floor; Batch 3's slot does the
  same). In the card's action row, flex stretch makes the officer's other
  pills 32 px too while "Start check-in" shows (inside the window only).
- **HereToggle keeps three things outside the component** (per event +
  person): a request still out, the tick's one pop, and focus that must
  follow a moved row. Marking moves the row to another section, which
  unmounts the button: without this a second tap on the moved button could
  race the first request, and keyboard focus would drop to <body>.
- **Focus after a mark:** to the next person's toggle in the SAME section
  (the row that slides into the gap), else the one before, with
  `preventScroll`; only an emptied section sends focus after the moved row.
  So an officer can go down "Said Going, didn't check in" marking people
  without the list jumping. Sections carry `data-here-list` for this.
- **Walk-ins taken off leave the list** (filtered before `splitAttendees`,
  which lists every walk-in as checked in); a failed DELETE brings them back.
  A clear drops all walk-ins.
- **Re-reads never overwrite a fresh change:** every mark / removal / clear
  bumps a sequence (a read that started before it is dropped), and no
  re-read is sent within 5 s of a change (one sent just after could still
  beat the change's request to the database). First-load failure shows the
  inline error as before; a failed re-read keeps the rows silently.
- **Headings count rows** (`splitAttendees` lengths), per batch-2's note;
  "Clear check-ins" shows on `checkin.count > 0`; the count moves by one
  with each flip and goes to 0 on a clear.
- **The attendee fetch now goes through `vibeRequest`** (quiet; the line
  under the title is vibeRequest's message instead of the raw server error).
- **Failure toasts** for marks and the clear use `CHECKIN_ERRORS.request_failed`
  as the fallback (the server's own sentence shows when it sends one);
  Start uses the contract's "Couldn't start check-in.".
- **Effects set state only in a promise callback** (`load()` returns void):
  the react-hooks `set-state-in-effect` rule flags an async useCallback
  called from an effect even when setState is after an await.
- **OrgPastEvents** uses `orgHandle` for the heading's id
  (`org-<handle>-past-events`, `aria-labelledby`); the heading is an `<h2>`
  styled like "Upcoming events". It re-reads after the modal closes, so a
  clear or a mark updates "N were there". "Who came" has
  `aria-label="Who came: <title>"`.
- **Start check-in** keeps "Starting…" while the door page loads, and
  resets if the card page comes back from the back-forward cache.

## Checks (Oct 19, end of batch)

- `npx tsc --noEmit -p .`: clean (whole project, with Batch 3's CheckinSlot
  on disk). `npm test`: 3295/3295.
- `npx eslint` on my five files: 0 errors; the 6 warnings are all old code
  in campus-home.tsx (two `window.location.assign`, `GlassCard`,
  `handleShare`, and the two `window.location.href` in messageOne /
  messageAll).
- Server-render smoke (scratchpad `b4b-smoke/`, jiti, clock stubbed 30 min
  into a 2 h event): StartCheckinAction draws "Start check-in" (button) for
  an officer, "Show check-in" (link to the door path) when open, nothing for
  a student, before or after the window. HereToggle: "Here" with
  `aria-pressed="true"` and "Checked in: <name>", "Mark as here" with
  `aria-pressed="false"`, nothing when not in and not markable; a checked-in
  walk-in still gets "Here" (to take it off).
- Live check NOT run: nothing answered on http://localhost:3000 for the
  whole batch (curl 000 at start and end, `lsof` empty). Not started, per
  the rules. The browser pass owes: officer card in the window shows "Start
  check-in" -> door page; back on the card "Show check-in"; Manage
  attendees split lists, Mark as here (row moves, focus stays in the
  section), take one off, Clear check-ins + confirm; club page Past events
  with "Who came".

## For the orchestrator

- **Label in name (HereToggle, contract wording):** pressed, the visible
  word is "Here" but the contract's aria-label is "Checked in: <name>", so
  the spoken name doesn't contain the visible word (WCAG 2.5.3). Built as
  the contract says. A fix would be "Here: <name>" / "Mark as here: <name>"
  (aria-pressed already says checked or not).
- **Phone tab bar over the attendee list on the club page (old, now on a
  busier path):** AttendeesModal and ConfirmDialog sit at z 1000 / 1100,
  portalled to <body>, under the phone tab bar (9988). globals.css hides
  the bar only for a dialog INSIDE `.vibe-tabbar-page`
  (`:has([aria-modal="true"])`), and a portalled one isn't. A long list's
  footer (Clear check-ins, Close) can sit behind the bar at 375 px on
  /orgs/<handle>. Same as Manage attendees there today. Not changed: raising
  the modal alone would put it above its own ConfirmDialog, and
  globals.css isn't mine.
- **A tap on "Here" after the mark window can't be undone from the list**
  (D8: taking off works any time, marking only to end + 24 h, and the
  code only to end + 1 h, so nobody can put it back). No confirm, per the
  contract. If wanted: an inline confirm on "Here" once `markPhase` is
  "after", like the card's "Remove my check-in" after close.

## Review round (Oct 19, later): seven findings

Verified against the code and the contract before any edit. Dev server:
nothing listens on :3000 again (curl 000, `lsof` shows only 54321), so no
live pass; not started, per the rules.

- 1 double tap hits the next row: REAL. In "Checked in", taking one off
  removes the row and the next one slides up under the finger. (Marking
  moves the row to the section above; rows below stay put unless scroll
  anchoring moves them, so that half is likelier on Chrome than Safari.)
- 2 one tap deletes for good after the mark window: REAL (raised by me the
  first time). Fix uses only contract words (removeConfirm / removeYes /
  removeKeep), so it stays inside the copy rule; flagged as a deviation.
- 3 a re-read can undo a mark still on its way: REAL (5 s guard only).
- 4 names cut to ~60 px at 375: REAL (291 px content, measured from the
  styles: 20 + 22 px padding each side).
- 5 label in name: REAL; constant `Mark as here: <name>` + aria-pressed.
- 6 tab bar over the portalled list: REAL on /orgs (and on /campus phone
  Events too, old). Fixed in my file by the z tier, not globals.css.
- 7 modal has no name, focus, trap or Escape: REAL (old S68 chrome, now
  on a new path).

### Fixes (all seven taken; none rejected)

- **1 (HereToggle):** a per-event `movedAt` stamp on every flip and every
  flip-back; a tap on any toggle of that list within 500 ms is dropped.
  A held Enter's repeats are dropped (`e.repeat`), since focus has already
  moved to the next person. A confirmed removal skips the 500 ms check.
- **2 (HereToggle + modal):** optional `confirmOff(opener, go)` prop. The
  modal passes it when nobody can put the check-in back from the list:
  `markPhase === "after"`, or a walk-in while `checkin.open` is false. A
  walk-in during open check-in doesn't ask (they can type the code again).
  It opens a ConfirmDialog: `"<name>: " + removeConfirm`, `removeYes` /
  `removeKeep` (busy never shows: the send is the toggle's optimistic one).
  Keep and Escape hand focus back to the toggle; Remove focuses it, then
  sends, so focus passes to the next person as a mark does.
  CONTRACT DEVIATION: 4.2 has no confirm here. Better words would need a
  new CHECKIN_COPY line (e.g. "Take <name>'s check-in off? It can't be
  added back."), which only the orchestrator can add.
- **3 (both):** `hereRequestsOut(eventId)` exported from HereToggle's
  module state; `load(false)` skips while any mark or removal is out (the
  5 s guard stays).
- **4 (AttendeeList):** with `here`, the row wraps; the name is
  `flex: 1 1 120px`, the toggle and Message are one group with
  `marginLeft: auto`. At 375 px the buttons go on a second line (name 249
  px, row 81 px); at desktop width rows stay one line (45 px). The list
  without `here` is unchanged.
- **5 (HereToggle):** `aria-label` is `Mark as here: <name>` in both states
  (CHECKIN_COPY.markHere); `aria-pressed` carries the state. CONTRACT
  DEVIATION from 4.2's `Checked in: <name>` when pressed (WCAG 2.5.3).
- **6 (modal):** the list's layer is 10000 (above the tab bar's 9988, under
  the toasts' 12000, CampusBrowsePicker's tier); its confirms 10100 through
  a new optional `zIndex` prop on ConfirmDialog (default 1100, so the
  event card and OrgPostsList are unchanged). No globals.css edit. Also
  fixes the same cover on /campus phone Events (old).
- **7 (modal):** the panel is the `role="dialog"` (`aria-modal`,
  `aria-labelledby` the "Attendees" h2, `aria-describedby` the event
  title), the backdrop is `presentation`. Focus goes to the title on open
  (tabIndex -1) and back to the opener on close when nothing else took it
  (kept in a ref: dev runs the effect twice). Tab and Shift+Tab wrap inside
  the panel (keys from the portalled confirms are ignored by DOM
  containment). Escape closes it unless a confirm is open.

### Checks (review round)

- `npm run typecheck`: clean. `npm test`: 3295/3295.
- eslint on my five files: 0 errors, the same 6 old warnings in
  campus-home.tsx. Whole-project `npm run lint`: 33 errors, all in files
  this build doesn't touch (mobile/*, ui/*, the-map, a handoff support.js).
- No dev server on :3000, so the real AttendeesModal + HereToggle were
  bundled with bun into a scratchpad harness (`b4b-review/`, fetch faked
  in the page, no database) and driven in headless Chromium:
  - focus lands on the "Attendees" h2; the dialog is named "Attendees";
    layer 10000; 30 Tabs never leave the panel; Shift+Tab from the title
    goes to Close; Escape closes and focus returns to the opener;
  - a double tap (150 ms) on "Here" sends one DELETE; a tap 600 ms later
    goes through (the next row);
  - after the mark window: every "Here" has `aria-haspopup="dialog"`;
    Enter opens the confirm (layer 10100, focus on Keep); Escape closes
    only the confirm, focus back on the toggle, no request; Remove sends
    one DELETE and focus moves to the next person's toggle;
  - a PUT held 8 s: a re-read tried at 6 s is not sent; one after it lands
    is, and the row stays marked;
  - 375 px: names 249 px wide, buttons on a second line; 1280 px: one line.
- Still owed (orchestrator's browser pass): the same on the real app at
  375 px on /orgs/<handle> and /campus, signed in as the owner.
