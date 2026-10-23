# Club view, wave 3: the night itself, and sharing (Oct 23, 2026)

Franky (relayed by the coordinating session, Oct 23): "start wave 3 now (Up next, Share page with the club's link
picture and table QR, event covers with icons first). Cut the hand-over to week 1." Build order:
`handoffs/2026-10-20-club-view/BUILD-ORDER.md` (wave 3). Designs: `handoffs/2026-10-20-club-view/shots/`
**Pick_UpNext.png** (one card for the whole night), **M_Share_Sheet.png** (Share the club), **M_Cards.png** (the
table card on the right; the three story cards are WEEK 1, not now). Wed Oct 28 is review day; freeze that night.

## Ships in two parts
- **Part 1 (B1, B2, B3): no database change, no Privacy Policy change** (nothing new is collected or shown: the
  link picture and the table card show only what the public club page already shows). Push to main when green.
- **Part 2 (B4): event icons.** One new column, so it waits for Franky's own yes in this session, then the
  migration, then the code, and the Privacy Policy line the same day. Built and kept on the branch until then.

## B1 · Up next with its steps (officers only)
Members and visitors keep today's Up next (the event card). The owner and officers get ONE card instead (match
Pick_UpNext.png): the event's time and place line, its title, a badge on the right ("In 3 days", "Tomorrow",
"Tonight", "Check-in open", "Done"), a rail of five steps (Posted · Going · Check-in · Who came · Thank-you; done =
a tick, current = coral ring, skipped = a dash, later = a number), one line of facts, and buttons: one coral
primary that is always the next thing to do, plus at most one quiet secondary.

**Which event** (pure function, tested): among the club's events,
1. one whose check-in window is open now (`checkinPhase(...) === "open"`: from an hour before the start to an
   hour after the end) → step **Check-in**;
2. else the most recent event that ended in the last 72 hours whose thank-you isn't done → step **Thank-you**;
3. else the soonest upcoming event → step **Going**;
4. else today's dashed "No event coming up" hint (unchanged).
Thank-you counts as done when the club has a page post created after the event's end (`latestPostAt`, given by
the page). Check-in and Who came count as done when `checked_in_count > 0`; after the event with no check-ins
they show as skipped and the line says "Check-in wasn't run."

**Lines and buttons**
- Going (before): "N going · M interested." Primary **Share the event** (the share helper: native share sheet,
  else copy; the link is the club's event link `/orgs/<h>?event=<id>`, text "<title> · <day, time> · <place>").
  Secondary **Edit** (the existing CreateEventModal in edit mode, as OrgEventsSection uses it).
- Check-in (window open): check-in running → "Check-in is open. N here so far." primary **Show check-in** (door
  page); not started → "Doors open soon? Start check-in." primary **Start check-in** (POST
  `/api/events/<id>/checkin/door`, then the door page, exactly as StartCheckinAction does). Secondary **Who came**
  (AttendeesModal, where officers mark people as here).
- Thank-you (after): "N came." (or "Check-in wasn't run.") Primary **Post a thank-you**: the club's NewPostModal
  opened with a starter text the officer edits: "Thank you to everyone who came to <title>!" plus, when there
  is a next event, " Next up: <next title>, <weekday>." Secondary **See who came** when N > 0 (AttendeesModal).
- After a thank-you is posted the card moves on to the next event by itself (the page reads again).
Reads: the provider's upcoming list, plus the officer-only past read `/api/events?org_id=<id>&when=past&limit=5`
(as OrgPastEvents does). Counts are exact for officers (the routes already say so).

Files: `club-page/UpNext.tsx` (officer branch), NEW `club-page/UpNextSteps.tsx` (the card) + NEW
`club-page/up-next-steps.ts` (pure: pick, step states, badge, lines, starter text) + `club-page/up-next-steps.test.ts`;
`src/app/orgs/[handle]/admin-actions.tsx`: `NewPostModal` gets an optional `initialContent?: string` (prefills the
caption; nothing else changes); NEW `club-page/share-event.ts` (`shareClubEvent({handle, eventId, title, when, place})`,
the same native → navigator.share → copy order as share-page.ts). UpNext's new prop:
`latestPostAt?: string | null` (B2 passes it from page.tsx).

## B2 · The share sheet and the club's link picture
- **Share sheet** (match M_Share_Sheet.png, minus the story cards and Instagram rows, which are week 1): the
  club page's Share page button (officers' half pill and members' square) opens it. A phone sheet / computer
  dialog, like PlusSheet's. Title "Share <club>", sub "Made from your club page. No names or faces." A preview
  of the club's link picture (`<img>` of `/orgs/<h>/opengraph-image`, 1200×630 scaled, rounded, alt "The picture
  people see when you send the link"). Rows: **Send it** ("GroupMe, iMessage and more": the native share sheet;
  only when the device has one), **Copy link** (shows the address), and for the owner and officers **QR for your
  table** ("Print or show on a screen": `/orgs/<h>/table-card`). Keep `shareClubPage` for the Arc / tools rows.
- **The link picture**: NEW `src/app/orgs/[handle]/opengraph-image.tsx` + `twitter-image.tsx` (read Next 16's
  metadata-file docs in node_modules/next/dist/docs first: params are a Promise; how a segment file and a
  `generateMetadata` image interact). Renderer NEW `src/lib/og/club-card.tsx` built like `share-card.tsx` (same
  fonts loader, ImageResponse): the club card from M_Cards.png in landscape 1200×630: the club's own background
  gradient (`backdropCss`, falls back to Dusk), the campus eyebrow ("INDIANAPOLIS · CLUB"), the logo (or the
  initials tile), the name in Fraunces, the bio's first line, "Follow us on vibe." + "@handle". No counts, no
  people. A hidden or missing club gets the generic card (never its name). `generateMetadata` stops naming
  `/opengraph-image` for a visible club, so the segment's own picture is used; the generic stays for hidden and
  missing clubs. Check signed-out: `curl -s localhost:3100/orgs/<h>` shows `og:image` pointing at the club's
  picture, and the image route answers a PNG.
- page.tsx: the metadata change, and pass `latestPostAt` (the newest club post's `created_at`, from the posts the
  page already reads) to UpNext.
Files: `src/app/orgs/[handle]/page.tsx`, `club-page/OfficerActions.tsx` (SharePageButton opens the sheet), NEW
`club-page/ShareSheet.tsx`, the two image files, `src/lib/og/club-card.tsx`.

## B3 · The table card
NEW `src/app/orgs/[handle]/table-card/page.tsx` (+ a small client Print button file): the owner and officers
only (others go to the club page; a hidden club is a 404 to anyone outside it, as the setup page does). A cream
5 × 7 in card (match M_Cards.png's right card): the logo or initials tile + "@handle", "Scan to follow <club> on
vibe.", a large QR of the club's address (`qrSvgFor` from `src/components/events/checkin/qr-path.ts`, drawn on the
server, black on white), the address under it. On screen: centred, with **Print** (window.print) and **Back to the
club**; a "Show on a screen" view is just this page. Print: `@media print` shows only the card, `@page { size: 5in
7in; margin: 0 }`, no app chrome, no tab bar. The card is cream in Light and Night alike (it prints clean); the
page around it follows the theme tokens. Not inside the app frame. Files: the new route only (+ a print rule in
globals.css if it can't live in the page).

## B4 · Event icons (Part 2: after Franky's yes)
- NEW `src/lib/events/event-icons.ts`: twelve keys with names and stroke paths: meeting "Meeting", social
  "Social", food "Food", music "Music", sports "Sports", games "Games", study "Study", talk "Talk", service
  "Service", arts "Arts", trip "Trip", party "Party"; `isEventIcon`, a default (no icon picked = the calendar
  glyph). + test.
- Migration NEW `supabase/migrations/20261027100000_event_icons.sql`: `events.icon text null` + a CHECK listing
  the twelve; header with PRE-FLIGHT (read-only, counts only), the apply, POST-CHECK and ROLLBACK, like
  20261026100000. Rehearse on the local stack; production untouched until Franky says yes here.
- Code: `EVENT_ROW_COLUMNS` + `EventListRow` + `toEventListItem` (event-item.ts), the validator (validate.ts, an
  enum like visibility), POST and PATCH `/api/events`, `CampusEvent.icon`, CreateEventModal (a row of icon
  choices: radio group, names under, arrow keys; optional), EventCard (a leading tile with the icon, the club's
  accent tint), the past-events rows (OrgPastEvents.tsx). Other surfaces later.
- Privacy Policy (only when it ships): section 3c "Club events, the icon each shows, and whether each is marked
  Members only…" + the .md twin + EFFECTIVE_DATE + checks.mjs.
- Not pushed to main until the migration is on production.

## Checks (every batch)
tsc, eslint on touched files, `npm test`, the club-page tests by hand (`cd "src/app/orgs/[handle]/club-page" &&
node --test *.test.ts`), an adversarial review per batch, a headless walk at 375 and 1440 (officer Maya, member
Blake), signed-out curl of the link picture. Handoff note; push Part 1 to main when green and check it live.
