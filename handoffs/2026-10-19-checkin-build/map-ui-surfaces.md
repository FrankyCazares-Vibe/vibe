# Check-in build: map of every UI surface that shows an event (lens: UI surfaces)

Read-only map, Oct 19 2026. Line numbers are at commit 6bb6c04 (main).

## 1. Desktop EventCard (src/app/campus/campus-home.tsx)

- `CampusEvent` type: campus-home.tsx:10274-10302. Fields today: id, org_id, creator_id,
  title, description, starts_at, ends_at, location, going_count, interested_count,
  viewer_status, is_creator, viewer_can_manage, org, creator.
  Check-in needs NEW fields from GET /api/events (and the org page loader):
  `checkin_open: boolean` (officer view), `viewer_checked_in: boolean`,
  `checkin_count: number | null` (null below 5 for non-officers). Add them here.
- Desktop grid: EventsTabBody maps `entries` -> `<Reveal><EventCard .../></Reveal>` at 10608-10623.
- `export function EventCard` 10685-11012. Props: ev, onMutate, onRemoved, onUpdated?, visiting?.
  - Header row 10802-10868: title + "by club" + "{going} going" pill (10854-10867).
    -> "N were there" (5+) public pill: render beside / instead of the going pill once the
       event has ended (use `useEventEnded(ev.ends_at)` at 11141), or as a line under the
       time block (10869-10890). Recommended: a small line under the time/location block at
       ~10890, same style as EVENT_CHAT_LINE (10944-10956), so the header pill stays "going".
  - Time/location block 10869-10890.
  - RSVP row 10908-10941 (`RsvpButton` Going / Interested).
    -> Student "I'm here" control: insert right after the RSVP row (after 10941, before the
       EVENT_CHAT_LINE at 10944). Show only when `inCheckinWindow(ev)` (1 h before start to
       1 h after end) AND check-in is open; it opens the code entry. Do NOT gate it on
       `status` (anyone may check in) and do NOT gate it on `rsvpAtHomeOnly`?  (product call:
       visiting campus = "may see the event"; the route decides; card mirrors route).
    -> Success state "You're checked in" + "Remove my check-in": same slot, swaps in once
       `viewer_checked_in` is true (remove stays available after the window, since a student
       can always remove their own).
  - Action row 10957-11007: Add to calendar / ManageAttendeesAction (10976-10981, gated on
    `ev.viewer_can_manage`) / EventOfficerActions (10987-10997, gated on viewer_can_manage
    AND org_id) / EventReportAction.
    -> Officer "Start check-in" button: insert in this row right after ManageAttendeesAction
       (after 10981), gated on `ev.viewer_can_manage` only (NOT `&& ev.org_id`: can_manage_event
       also allows an org-less event's creator, matching ManageAttendeesAction's gate) and on
       the window (show from 1 h before start until 1 h after end; outside it, hide).
       While open, the label reads "Check-in open" and reopens the door view.
    NB: the row's outer condition at 10957 is `(status || ev.viewer_can_manage || !ev.is_creator)`;
       a student's "I'm here" must NOT live in this row (a creator with no RSVP who can't manage
       would not see the row) -- keep it in its own slot after the RSVP row.
- Style constants: `eventCardSubtleLink` 11021-11035 (pill link), `eventCardDangerLink`
  11185-11190, ManageAttendees' coral pill inline at 11101. Re-use these for the new buttons.
- `useEventEnded(endsAt)` 11141-11155 and `eventHasEnded` 11131 are the clock pattern to copy
  for `useCheckinWindow(starts_at, ends_at)` (two flips: window opens, window closes; same
  2_000_000_000 ms setTimeout ceiling guard). These are file-private: move/duplicate into the
  new `src/lib/events/checkin-window.ts` (pure, testable) rather than exporting from campus-home.

## 2. ManageAttendeesAction / AttendeesModal / AttendeeList (campus-home.tsx)

- `ManageAttendeesAction` 11088-11114: button + `{open ? <AttendeesModal/> : null}`.
- `type Attendee` 11473-11483: { status: "going"|"maybe", user{id,name,handle,avatar_url,major,year} }.
  -> add `checked_in: boolean` (and maybe `checked_in_at`) to the row; plus a third list
     `checked_in_only` (people who checked in without an RSVP) from the attendees route.
- `AttendeesModal` 11485-11699: fetches `/api/events/${eventId}/attendees` (11503) with raw fetch
  (not vibeRequest); portalled to body (11577); `ModalScrim` + `motion.div` with
  `MODAL_PANEL_ENTER_FADE` (11595-11598); surface `eventModalSurface` (12303-12325), maxWidth 520,
  maxHeight 82vh, overflow auto. Two `<AttendeeList>`: Going 11663-11668 (accent #5BD18C) and
  Interested 11669-11674 (accent #FFB85A).
  -> "Checked in · N" list: insert a third `<AttendeeList>` ABOVE Going (before 11663) once the
     window has opened or anyone checked in; rows = everyone checked in (RSVP'd or not).
  -> "Said Going but didn't check in": either a sub-heading inside the Going list or a 4th list
     after Going; officers only (this modal is already officers-only).
  -> "Clear check-ins" (officer): small danger link at the modal footer beside Close (11676-11694),
     with `ConfirmDialog` (11336-11471, exported) for the confirm.
- `AttendeeList` 11701-~11823: one row per attendee (avatar 11754-11773, name/sub 11774-11799,
  Message button 11800-11817).
  -> "Mark as here" tick: insert a toggle button in the row BEFORE the Message button
     (before 11800), i.e. `onToggleHere?: (userId, next) => void` + `checkedIn` per row. A
     checked row shows a green tick; the tick is an `aria-pressed` button, 32px min target.
- `ConfirmDialog` (exported) 11336-11471: reuse for "Stop check-in?" (not needed) and
  "Clear all check-ins for {title}? This can't be undone."
- Motion helpers (file-private): `ModalScrim` 4325-4345, `MODAL_PANEL_ENTER` 4348-4352,
  `MODAL_PANEL_ENTER_FADE` 4357-4361 (all SPRING_SOFT from src/lib/motion/springs).
  NB they are NOT exported; a new component file needs its own copy or an export.
  Recommended: move ModalScrim + MODAL_PANEL_ENTER(_FADE) + eventModalSurface into
  `src/components/events/event-modal-chrome.tsx` in the wiring step (campus-home imports them
  back), or just export them from campus-home (smaller diff; new files import from it the way
  OrgEventsSection already imports EventCard).

## 3. Org page (src/app/orgs/[handle]/)

- page.tsx:522-529 mounts `<OrgEventsSection orgId orgName orgHandle orgVerified viewerRole rsvpAtHomeOnly>`.
- OrgEventsSection.tsx imports `EventCard`, `CampusEvent`, `CreateEventModal` from
  `@/app/campus/campus-home` (lines 5-10) -- precedent: new check-in components can be imported
  the same way, or (better) live in their own file that campus-home AND this file import.
- Cards rendered at OrgEventsSection.tsx:183-202 (`<EventCard ... visiting={rsvpAtHomeOnly}/>`).
  Heading "Upcoming events" (128-137). Nothing to add here: every check-in control rides inside
  EventCard. `canManage` (55) is owner/admin only; EventCard uses `ev.viewer_can_manage` instead.
- GOTCHA (applies to all three EventCard lists): GET /api/events filters `.gte("ends_at", nowIso)`
  (src/app/api/events/route.ts:164; comment at 102-104 "Past events are hidden in v1"). So:
  (a) an event's card DISAPPEARS from every list at ends_at, but the check-in window runs to
      ends_at + 1 h -> during that last hour the only way in is the QR landing page
      (/events/[id]/checkin) or the event chat; the officer's "Start check-in"/door view also
      vanishes with the card unless the door view is its own route.
  (b) the public "N were there" can only ever show on a live card (start..end) unless a past
      surface is added. Options: (1) widen GET to `ends_at >= now() - 1 h` so cards stay through
      the window (cheap; the list then shows "ended" cards for an hour -- EventOfficerActions
      already flips to "Delete event" via useEventEnded 11141); (2) a "Past events" block on the
      org page (`/api/events?org_id=..&past=1`) where "N were there" lives for good. Recommend (1)
      now + (2) on the org page as the home of "N were there"; needs a product call.

## 4. Phone (src/components/mobile/CampusMobile.tsx)

- Imports `EventCard`, `CampusEvent` from campus-home (9-18); `Drawer` from vaul (7).
- Events tab pane: section at ~1156-1200: EventFilterChips, `<TonightSection layout="phone">`
  (1161-1167), then `<EventsPane .../>` (1168+).
- `function EventsPane` 2539-2645; club cards rendered at 2622-2629
  (`<Reveal ... still={i >= REVEAL_SCREENFUL}><EventCard ev onMutate onRemoved onUpdated visiting/>`).
  The phone uses the SAME EventCard, so every insertion point in section 1 covers the phone too.
- Phone vs desktop inside EventCard: the card does not know which surface it is on.
  `EventReportAction` (campus-home 11058-11086) is the precedent: `useIsMobile()`
  (`@/lib/use-is-mobile`, imported at campus-home:152) picks `variant="sheet"` vs `"modal"`.
  Today `AttendeesModal` is the centered desktop dialog on phones too (padding 20, maxHeight 82vh).
  -> New: the check-in code entry and the attendees list should follow the same split: phone =
     vaul bottom sheet, desktop = centered dialog (ModalScrim + MODAL_PANEL_ENTER_FADE).
  -> The door view is full screen on BOTH (fixed inset 0, portalled), so it needs no split.
- No phone-only attendees list exists anywhere in src/components/mobile/** (grep: no
  "attendees" outside campus-home + the API route). AttendeesModal is the only one.
- Tonight (club rows are tap-to-scroll only, no RSVP): TonightSection.tsx:262-270 (row ->
  `onPickClubEvent(item.ev.id)`), TonightSheet.tsx (vaul sheet, rows -> Events tab), TonightCard.
  Counts there go through `publicGoing` / `TONIGHT_COUNT_FLOOR = 5`
  (src/components/campus/tonight/tonight-view.ts:39-40, 93-98). No check-in UI needed in Tonight;
  optional later: "N here" on a live row, same floor. Leave out of v1.

## 5. Desktop Messages + event chat (club rooms)

- src/components/desktop/messages/ClubPanel.tsx: its own private `EventCard` (164-219) for the
  club's next event (EventRef, not CampusEvent): state line + "N going" (174) + title + place +
  RSVP pill (186-217, opens `onRsvp`). `EventRow` 221-251 for the one after. Mounted 369-376.
  -> Optional "I'm here" pill: next to the RSVP pill in the row at 186-217 when the event is in its
     window (`event.state === "live"` is close but not equal: window starts 1 h before start).
     Needs EventRef extended (`checkin_open`, `viewer_checked_in`) in src/lib/chat/types.ts:49-61
     and the space read. Recommend v1 SKIPS the chat surfaces (the card, QR landing and
     event-chat header cover it) and lists them as wave 2.
- src/components/desktop/messages/EventPanel.tsx:44-83 wraps the phone's `EventAbout`.
- src/components/mobile/messages/club/EventAbout.tsx (event chat header, phone + desktop):
  hero + StatePill (35-80), Where/When tiles (115-131), "Who's going" row with RSVP pill
  (133-163). -> Best chat insertion point if wave 2 wants it: a second pill in the Who's going row
  before the RSVP button (before 151), or a row under it at 164. It uses `palette(night)` tokens.
- src/components/mobile/messages/cards/EventCardView.tsx (event card posted in a room): RSVP pills
  163-168, "N going" + "Open event chat" 170-183. Not a check-in surface (skip).
- RsvpSheet.tsx (club/RsvpSheet.tsx) is the model for a chat-side sheet: phone = `Drawer.NestedRoot`
  (vaul) with sheet-styles, desktop surface = `DesktopDialog` (useChatSurface()). 

## 6. Other event surfaces (checked; no v1 change needed)

- Static twins: public/html/profile.html and messages.html render NO campus events. Their
  calendar (`addCalEvent` profile.html:7639, `_calLoad` 7800, `.cal-event-item` 7673) is the
  student's own localStorage calendar; no `/api/events` or RSVP call in either file or in
  public/html/_*.js. -> No static twin to update.
- Desktop sidebar "My Calendar": src/components/LeftNav.tsx (`CalEntry` 393-416, fetch
  `/api/me/calendar` 468/489, entry card ~1405-1460 with the .ics link 1444). Shows RSVP'd events
  only; uses CSS tokens (var(--charcoal), var(--ink-muted), var(--tag-ink)). Wave 2 candidate
  ("Check in" link on today's RSVP'd entry during the window). Skip in v1.
- Phone Messages home week + desktop WeekBand/MonthPopover (src/components/mobile/messages/home/
  MessagesHome.tsx, src/components/desktop/messages/WeekBand.tsx, MonthPopover.tsx): plans from
  /api/me/calendar. Skip in v1.
- Club Up next / FollowerBoard (src/components/mobile/messages/club/UpNext.tsx, FollowerBoard.tsx:183
  "N going"). Followers read the Board only; no check-in there. Skip.
- Feed side Tonight panel (campus-home.tsx:6790 `eventsUrl`, TonightPanel.tsx): rows jump to the
  Events tab. Skip.

## 7. The QR landing route

- No `src/app/events/` exists today. Page template to copy: src/app/posts/[id]/page.tsx
  (server component, `generateMetadata` with a generic `robots: { index: false }` card, signed-out
  branch) and the gate src/lib/auth/campus-access.ts:23-55 `enforceCampusAccess(currentPath)`
  (login -> /auth/terms -> /auth/school-email -> /onboarding, each with `next=`).
- Login keeps the query: src/lib/auth/login-next.ts:37-42 `sanitizeLoginNextParam` allows any
  safe relative path WITH its query, so `next=/events/<id>/checkin?c=<token>` survives sign-in.
  BUT the token rotates every ~30 s: by the time a signed-out student has signed in, it has
  expired. The landing must fall back to "Type the 4-digit code at the door" (same input as the
  card) instead of an error. Recommend the QR token be accepted for its own period + the one
  before (route lens decides; UI just shows the code box on `code_expired`).
- Proxy: no change needed for a new page path. `cspFlavor` (src/lib/security/csp.ts:136-141)
  gives every non-/html path the "app" CSP with a nonce. Inline SVG QR needs no CSP change
  (img-src already allows `data:` and `blob:` at csp.ts:206 if an <img> is ever used).
  Suspended students are redirected away from pages by the proxy (src/proxy.ts:315-325) and their
  writes 403 at src/proxy.ts:203-210 `restrictedApiAllowed`. Moderation model says restricted
  students "can delete": add `DELETE /api/events/<id>/checkin` (own check-in) to that list.
- Path choice (store apps): Android App Links only claim listed prefixes
  (mobile/android/app/src/main/AndroidManifest.xml:46-64: /auth/*, /campus, /messages, /posts/,
  /profile/, /orgs/, /settings). `/events/...` is NOT there, so a QR scanned on Android opens the
  browser even with the store app installed. iOS applinks wait on the AASA file (entitlements
  note, mobile/ios/App/App/App.entitlements:14-23); no public/.well-known exists yet.
  Options: (a) `/events/[id]/checkin` + add `<data android:pathPrefix="/events/" />` with the next
  app build; (b) host it at `/campus/checkin/[id]` (src/app/campus/checkin/[id]/page.tsx), which the
  existing `/campus` prefix already covers. Recommend (b) unless Franky prefers the nicer URL;
  there is no src/app/campus/layout.tsx, so a nested route inherits nothing from CampusSwitch.
- Landing page layout: one centered column (max ~420px, 16px gutters) on both widths, so no
  phone/desktop split. Uses theme tokens (var(--cream) bg, var(--charcoal) ink, var(--ink-muted),
  var(--hairline), var(--coral) + var(--on-coral) for the primary button, var(--ok-ink) for the
  checked-in line) so it follows Night. States: loading -> "Checking you in to <title>" ->
  success (tick pop) / code box (expired or no token) / "Check-in is closed" / "This event isn't
  on right now" (outside the window) / "You can't see this event" (404, same words for missing).
  Never show who else is there. A "Go to the event" link back to `/campus?tab=events&event=<id>`
  (the C2 anchor the card already carries: `id="event-<id>"`, campus-home.tsx:10779).

## 8. Officer door view (full screen: QR + 4-digit code + countdown + live count + Stop)

- Opened from the "Start check-in" button in EventCard's action row (insert after
  campus-home.tsx:10981). Same component on phone, desktop Events tab and the org page.
- Portal to document.body like ConfirmDialog/AttendeesModal (campus-home 11383, 11577) and stop
  `onPointerMove` (11387, 11582) or MouseSpotlight tilts the card behind it.
- z-index: the phone tab bar is fixed at 9988 (src/lib/chat/use-hide-tabbar.ts header comment);
  ReportSheet uses 10400/10401 (src/components/safety/ReportSheet.tsx:578-597). Use ~10500 AND call
  `useHideTabBar()` (src/lib/chat/use-hide-tabbar.ts) so the bar can't sit over the Stop button.
- Mark the root `data-holds-reload=""` (src/lib/build/page-snapshot.ts:27, build-refresh.ts:218)
  so a deploy never reloads the door screen when the officer comes back to the tab.
- Keep the screen awake: `navigator.wakeLock?.request("screen")` on open, again on
  visibilitychange -> visible, release on close; feature-detect, fail silently. No wake-lock code
  exists in the repo yet.
- QR: no QR library in package.json or node_modules. Needs one dependency; recommend a tiny
  zero-dep encoder that returns a module matrix (e.g. `uqr` or `qrcode-generator`) rendered as ONE
  inline `<svg><path/></svg>` (no innerHTML, no data: URL). Pin the exact version. QR stays dark
  modules on a fixed white tile with a 4-module quiet zone in BOTH themes (cameras read inverted
  codes badly): the one deliberate exception to theme tokens; say so in a comment.
- Layout (phone portrait 375): event title (1 line, Fraunces) / QR square `min(72vw, 44dvh)` /
  code in big tabular digits (`fontVariantNumeric: "tabular-nums"`, ~64px, letterSpacing) /
  "New code in 12 s" / "N checked in" / two buttons: "Hide" (closes the screen, check-in stays
  open) and "Stop check-in" (danger pill like `eventCardDangerLink` 11185). Desktop: QR left, code
  + count right, max ~760px, centered. Background var(--cream), ink var(--charcoal) (Night-aware).
- Clock: `useCampusNow(1_000)` (src/components/campus/tonight/use-campus-now.ts; shared ticker,
  0 until hydrated; dev override `?tonight_now=` for testing the window) for the countdown;
  refetch the door feed at each period end and every ~5 s for the count (pattern:
  src/lib/chat/use-room-poll.ts:384-412 interval + visibilitychange).
- Motion (src/lib/motion/springs.ts): new code crossfades + rises (`opacity`/`y`, SPRING_SOFT,
  RISE_PX); count bump pops (SPRING_POP, like LikeBurst src/lib/motion/LikeBurst.tsx:20); the
  countdown is text plus an optional bar driven by `transform: scaleX` (never width or
  stroke-dashoffset). Screen enter = MODAL_PANEL_ENTER_FADE pattern (campus-home 4357-4361).
- a11y: role="dialog" aria-modal, labelled "Check-in for <title>"; the code is NOT aria-live
  (it would speak every 30 s); the count is aria-live="polite"; Escape = Hide (never Stop).
- Officer count is exact (no floor): they can already see the full list.

## 9. Student "I'm here" (code entry), success, "Remove my check-in", public count

- Slot: its own block in EventCard right after the RSVP row (after campus-home.tsx:10941, before
  the EVENT_CHAT_LINE block 10944-10956). NOT inside the action row (10957 condition hides that row
  for a creator with no RSVP).
- Gate: during the window only (1 h before start .. 1 h after end) using `useCampusNow(60_000)`
  plus a pure `checkinWindow(starts_at, ends_at, now)`; 0 (not hydrated) = draw nothing.
  Not gated on RSVP (anyone may check in) and, per the brief, not on `rsvpAtHomeOnly`/visiting
  (RSVP is home-campus-only; check-in is "anyone who may see the event") -- flag for Franky.
  Recommend showing it through the whole window even if GET said check-in is closed (the list
  never polls, so `checkin_open` goes stale); the sheet answers `checkin_closed` in words.
- Code entry: phone = vaul bottom sheet, desktop = centered dialog, chosen by `useIsMobile()`
  (src/lib/use-is-mobile.ts, breakpoint 900) exactly like EventReportAction (campus-home
  11058-11086). Sheet chrome: ReportSheet's sheet branch (ReportSheet.tsx:431-456: Drawer.Root,
  Overlay, Content, Handle, Title; z 10400/10401) or sheet-styles.ts (vaulOverlayStyle 1200,
  vaulContentStyle: var(--cream), safe-area bottom). Dialog chrome: ModalScrim + motion.div with
  MODAL_PANEL_ENTER_FADE + eventModalSurface (as AttendeesModal 11577-11607).
  Input: copy ConfirmCodeForm's field (src/components/auth/ConfirmCodeForm.tsx:211-225:
  type="text", inputMode="numeric", pattern="[0-9]*", strip non-digits, cap length, no
  maxLength) BUT use autoComplete="off", not "one-time-code" (iOS would offer an unrelated SMS
  code). Auto-submit at 4 digits; wrong code -> shake-free inline line "That code didn't work.
  Check the screen at the door." (no blame), the field clears.
- Success: the slot swaps to "You're checked in" with the coral check disc (same mark as the
  Going pill in ClubPanel.tsx:198-205), popped once with SPRING_POP; beside it a subtle
  "Remove my check-in" (`eventCardSubtleLink` 11021). Inside the window no confirm (they can check
  in again); after the window a ConfirmDialog (11336) "Remove your check-in? You can't add it
  back." Never the words "safety" or anything about location.
- The card leaves every list at ends_at (route.ts:164), so "Remove my check-in" needs a home after
  the event: recommend a "Your check-ins" card in Settings, modelled on BlockedUsersCard
  (src/components/settings/SettingsClient.tsx:234-340: list + per-row remove, LoadFailed, tokens),
  mounted between BlockedUsersCard and HelpAndSafetyCard (SettingsClient.tsx:151-152). That also
  gives the Privacy Policy a concrete "you can see and remove them in Settings" line.
- Public "N were there": a line under the time/location block (after campus-home.tsx:10890) or in
  the header beside "{going} going" (10854-10867). Wording: "N checked in" while the event is on,
  "N were there" once ended (`useEventEnded` 11141). Number comes from the server already floored
  (null under 5 for non-officers); the client floor helper to mirror is `publicGoing` /
  TONIGHT_COUNT_FLOOR (tonight-view.ts:39-40, 93-98). Officers see the exact number in the
  attendees modal, not on the card.

## 10. Recommended new files (campus-home.tsx and CampusMobile.tsx stay wiring only)

src/components/events/checkin/
- `checkin-view.ts` (+ `checkin-view.test.ts`): pure. `checkinWindow(starts, ends, now)` ->
  "before" | "open" | "after" with the 1 h margins; `publicCheckinCount(n)` (floor 5);
  `sanitizeDoorCode(raw)` (digits, 4); CHECKIN_COPY (every string, plain English, no "safety").
- `CheckinSlot.tsx`: the student block for EventCard (I'm here / You're checked in + Remove /
  "N were there"). Props: ev (id, title, starts_at, ends_at, viewer_checked_in, checkin_count),
  onChanged.
- `CheckinCodeSheet.tsx`: the code entry, sheet on phone / dialog on desktop (useIsMobile).
  Re-used by the landing page body (as an inline form there, not a sheet).
- `StartCheckinAction.tsx`: officer pill for EventCard's action row; owns the door view's open state.
- `DoorView.tsx`: the full-screen officer view (section 8).
- `QrCode.tsx`: matrix -> one SVG path (the only file that imports the QR dependency).
- `use-door-feed.ts`: GET the door feed (code, link, expires_at, count) on period boundaries +
  every ~5 s while visible; start/stop calls.
- `HereToggle.tsx`: the "Mark as here" tick used in AttendeeList rows.
- `CheckinLanding.tsx`: client body of the QR landing page.
src/components/settings/CheckinsCard.tsx: "Your check-ins" list (section 9).
src/app/campus/checkin/[id]/page.tsx (or src/app/events/[id]/checkin/page.tsx, see section 7).

Wiring edits in campus-home.tsx (small):
1. `CampusEvent` (10274-10302): + `checkin_open`, `viewer_checked_in`, `checkin_count`.
2. EventCard: `<CheckinSlot>` after 10941; `<StartCheckinAction>` after 10981 (gate
   `ev.viewer_can_manage`); optional count line after 10890.
3. `Attendee` (11473-11483) + `checked_in`; AttendeesModal: "Checked in" list above 11663, the
   "said Going but didn't check in" split, "Clear check-ins" beside Close (11676-11694), a poll
   while the window is open; AttendeeList (11701+): `<HereToggle>` before the Message button 11800.
4. Export (or move to a shared file) ModalScrim 4325, MODAL_PANEL_ENTER_FADE 4357,
   eventModalSurface 12303, eventCardSubtleLink 11021, eventCardDangerLink 11185, ConfirmDialog
   (already exported 11336), useEventEnded 11141 so the new files don't copy them.
CampusMobile.tsx: no edit (it renders the shared EventCard at 2622). OrgEventsSection.tsx: no edit.
SettingsClient.tsx: mount `<CheckinsCard />` at 151-152.

## 11. Phone vs desktop, tokens, motion (summary)

- Same EventCard everywhere; the card asks `useIsMobile()` when it needs a sheet vs a dialog.
- Event cards sit on the always-dark Events scene: they use dark constants (DARK_GLASS_SURFACE
  campus-home 6832, COLORS.glassMuted, "#fff") not page tokens; new pills on the card match those
  (eventCardSubtleLink). Everything that is its own page or overlay (door view, landing, the phone
  sheet on var(--cream), the Settings card) uses tokens: --cream, --charcoal, --ink-muted, --ink-2,
  --hairline, --coral, --on-coral, --tag-ink, --ok-ink, --error-ink, rgba(var(--scrim-rgb),a).
  Coral as words on cream = var(--tag-ink) (COLORS.accentInk); words ON coral = var(--on-coral).
- Motion: only SPRING_SNAPPY / SPRING_SOFT / SPRING_POP / RISE_PX from src/lib/motion/springs.ts,
  `Reveal` for arriving content, `.vibe-press` (globals.css:2752-2779) on tappable pills;
  transform/opacity only; MotionRoot already respects reduced motion.

## 12. Open product calls this lens surfaced

1. Cards vanish at ends_at but the window runs to end + 1 h: widen GET /api/events to
   `ends_at >= now - 1 h`, or rely on the QR landing for that hour?
2. Where "N were there" lives after the event (needs a past-events surface; org page suggested).
3. Visiting students: may they check in (the brief says anyone who may see the event; RSVP says
   home campus only)?
4. Landing path `/campus/checkin/<id>` (already an Android app link) vs `/events/<id>/checkin`
   (new manifest line + app build).
5. "Your check-ins" in Settings as the after-the-event place to remove one (recommended).
6. One new npm dependency for the QR (pinned, tiny, zero-dep).
