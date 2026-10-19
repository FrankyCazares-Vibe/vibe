# Map: the UI the Tonight build changes (lens: UI)

Read-only map, Oct 19 2026. Line numbers are at HEAD 7181bf3 (campus-home.tsx = 17,968 lines).

## 1. Desktop page shell (what sits around FeedTabBody)

- `src/components/campus-app-shell.tsx:33` `CampusAppShell` = grid `.vibe-app-shell`
  (`globals.css:2273`: `grid-template-columns: 200px 1fr`, min-height 100vh). LeftNav is the 200px column.
  It ALREADY takes an optional `sidebar` prop -> `.vibe-app-shell--with-rail` (200px 1fr 320px,
  `globals.css:2278`) + `.vibe-right-rail` (hidden < 900px, `globals.css:2313`). CampusHome does not pass it
  (`campus-home.tsx:980`). Do NOT use it for C2: a shell rail would push the feed off-centre (C2 wants the
  feed exactly centred) and it would show on every tab. Build the panels inside FeedTabBody's area instead.
- OttoCorner is mounted by the shell (`campus-app-shell.tsx:47`), hidden < 900px (`globals.css:2316`) and on
  the Chat tab via `body.vibe-hide-otto` (`globals.css:2322`).
- CampusHome render: `campus-home.tsx:979-1209`. Outer div is `VIBE_BLOOM_HOST` flex column (line 983);
  `CampusTopBar` (line 1006), `PickCampusStrip` (1013), `VisitingBanner` row (1017-1026, maxWidth 720), then
  for feed/events/orgs/map the `.campus-feed-grid` div (1099-1124, flex column) wrapping `TabBody`.
  `.campus-feed-grid` CSS at `globals.css:2548` only matters < 760px (grid 1fr) and `.campus-feed-aside`
  (2551) is hidden < 760px: a dead hook from the old Otto rail, reusable name but its breakpoint is wrong
  for C2 (C2 folds at 1400/1100).
- `TabBody` `campus-home.tsx:6746-6783`: feed -> `FeedTabBody` (6766-6775, keyed by tag filter),
  events -> `EventsTabBody` (6776-6779).

## 2. FeedTabBody (desktop feed column)

- `campus-home.tsx:7029-7368` (return at 7204). The column is the `<section id="campus-feed">` at 7208-7220:
  `padding: 28px 24px; maxWidth: 720; margin: 0 auto; width: 100%; gap: 14`. So the reading column is
  672px of content centred in the space right of the 200px LeftNav.
- Order inside: SceneHeader (7222-7236) -> RollingStrip (7245-7254, `!tagFilter` only) -> back button
  (7256-7280, tag filter) -> composer / VisitingComposerNote (7283-7292) -> posts (~7297-7366, `Reveal` per row,
  map at 7349). Section closes 7367.
- It owns `useStripData` (7055-7060) and `useCampusView()` (7047).
- Surfaces available: `FEED_CARD_SURFACE` (`7022-7027`: `var(--glass)`, `1px solid var(--glass-border)`,
  radius 18, `var(--card-shadow)`, no blur) = the token-based card, Night-safe. USE THIS for the C2 panels.
  `GlassCard` (6785, white glass, `GLASS_SURFACE` 329, meant for dark scenes) and `DarkGlassCard`
  (6818, hard-coded charcoal `DARK_GLASS_SURFACE` 6804, `#fff` text) are NOT token-based; DarkGlassCard is
  what Events cards use. `COLORS` (295-327): `text var(--charcoal)`, `muted var(--ink-2)`,
  `faint var(--ink-muted)`, `border var(--hairline)`, `accent #FF5C35`, `accentInk var(--tag-ink)`.
- `SceneHeader` 10192-10249 (eyebrow Fraunces 11px caps `var(--eyebrow-ink)`, h2 Fraunces clamp 22-28).

## 3. Header, Otto corner, mini messenger (what the side panels must clear)

- Desktop top bar `CampusTopBar` `campus-home.tsx:5609`: 64px tall, `position: relative` (NOT sticky; it scrolls
  away, see the EventCard comment at ~10660 "the top bar scrolls away with the page"). So a sticky side panel
  uses `position: sticky; top: 0` with 28px top padding, as the C2 board does.
- Otto orb `src/components/network/OttoCorner.tsx:206-217`: `position: fixed; bottom: 24; right: 24;` 52px
  (64px with an unread mention), z 9990. Its toast: `bottom: 92; right: 24; maxWidth 320` (line 522-526),
  i.e. it can sit over the bottom of a right panel for a few seconds (acceptable; it is an overlay).
- Otto side panel / mini messenger: `OttoSidePanel.tsx:283-293` fixed right 0, width 380, z 9999 with a scrim
  (9998). It is an overlay, so no layout room is reserved for it. MiniMessenger (`desktop/messages/
  MiniMessenger.tsx`) lives inside that panel. Nothing in the page flow needs to move for it.
- Board rule for the orb lane (C2_Desk.dc.html CSS): the tonight panel `max-height: calc(100vh - 192px)`
  (64 header + 28 pad + 24 above orb + 52 orb + 24) at >=1400, `calc(100vh - 262px)` below 1400 (the folded
  clubs strip takes 56 + 12 + 2). The lists inside scroll (`overflow-y: auto`), header and #1 slot fixed.

## 4. The "today." RollingStrip (so Tonight doesn't duplicate it)

- Component `src/components/campus/RollingStrip.tsx:56`; data hook `src/components/campus/strip-data.ts:57`
  `useStripData` = `GET /api/me/upcoming-events?limit=3&days=14` (the viewer's OWN RSVP'd events, going|maybe)
  + `GET /api/trending/hashtags?limit=8`. Chips: events first (soonest, max 3, "Today"/"Tmrw"/weekday via
  `formatUpcomingChip` rolling-strip-view.ts:53), then tags. Lead-in `today.` / `there.` (rolling-strip-view.ts:174).
- Overlap with Tonight: a CLUB event tonight that the viewer RSVP'd shows in BOTH the strip ("Today") and in
  Tonight's "Also tonight from clubs". School events never appear in the strip (no RSVP on them in v1).
  Board answer (C2 data comment): left panel = Board lines, never next events, "events already live in the
  today strip and the Tonight rail". Recommendation: accept the overlap (the strip is "yours", Tonight is
  "campus"), OR filter tonight's club rows out of the strip. Do NOT change the strip in v1; simplest.
- Desktop strip: `campus-home.tsx:7245-7254` (`roll`). Phone strip: `CampusMobile.tsx:1076-1083`.
- `onPickEvent` (desktop CampusHome passes it down via TabBody, `campus-home.tsx:1117`) switches to Events
  and flashes `#event-<id>` (EventsTabBody highlight effect `10377-10393`). Tonight's club rows can reuse
  exactly this callback for "open this event". School rows link out (their calendar), no in-app card.

## 5. Desktop Events tab (D2)

- `EventsTabBody` `campus-home.tsx:10275-10512`. Loads `view.url("/api/events?limit=50")` (10289) into
  `events: CampusEvent[]` (type at 10246-10273: `id, org_id, title, starts_at, ends_at, location,
  going_count, interested_count, viewer_status, org{id,handle,name,logo_url,verified}`...).
  GET /api/events lists only events that haven't ended (comment at 11011-11013).
- Section: `campus-home.tsx:10396-10406` `padding 28px 24px; gap 16; maxWidth 1100; width 100%` (NOTE: no
  `margin: 0 auto`, so it is left-aligned beside the nav; D2 board keeps that).
- Header row 10407-10449 (SceneHeader "What's coming up" + "+ Create event").
  INSERT the Tonight section + chips between the header row (closes 10449) and the list switch (10451).
- Grid 10482-10505: `repeat(auto-fill, minmax(280px, 1fr))`, gap 14, `Reveal` per `EventCard` (map at 10494).
- Empty/loading states (10451-10480) currently REPLACE the grid: with Tonight above them they still read fine
  (Tonight is its own block), but "No upcoming events on campus" under a Tonight full of school events reads
  odd: reword to "No club events coming up" when Tonight has rows (copy call).
- `EventCard` `campus-home.tsx:10565-10900` (exported; also used by the phone and club pages; `scrollMarginTop` 10665): DarkGlassCard
  surface via `MouseSpotlight` + `DARK_GLASS_SURFACE` (6804), left stripe `colorForOrg`, "{going} going" pill
  ALWAYS shown (10746: raw count, even 0-4). Tonight's 5+ rule is stricter than the card; keep the card
  as is (it's the club's own event) but do not copy its pill into Tonight rows.
  Helpers to reuse: `formatEventTime` 11763, `eventHasEnded` 11005, `useEventEnded` 11015, `RsvpButton` 11700,
  `colorForOrg` 278, `initialsForOrg` 285, `relativeTime` 6995, `hexToRgba` 17798.

## 6. C2 desktop feed: how to build it in the app (insertion + props)

Board: `handoffs/2026-10-18-side-space/project/C2_Desk.dc.html` (CSS block at its `<style>`: `.cbs-grid`,
`.cbs-left`, `.cbs-right`, `.cbs-fold`, `.c2-tonight`, `.c2-scroll`, `.c2-clubs-sum/full`, media 1399/1099/879h).
Shots: `shots/C2_Desk.png` (1440), `C2_Desk@1280.png` (folded), `C2_Desk_Featured.png` (rule 1).

Measured on the 1440 render: main area 1240 (beside the 200 nav); feed cards x 484-1156 (672); left panel
x 220-463 (~244); right x 1177-1419 (~243); 20px gutters. At 1280: feed 264-936, right stack 956-1228 (272),
the clubs fold into a 56px "YOUR CLUBS >" strip of 32px tiles above Tonight, club rows fold into one
"Also tonight from clubs · N more >" row. Below 1100: rails gone, feed centred alone.

Where: wrap FeedTabBody's `<section id="campus-feed">` (`campus-home.tsx:7208-7367`) in a 3-col grid:
- grid `minmax(0,1fr) minmax(0,720px) minmax(0,1fr)`, areas `left feed right`, `align-items: start`;
  the section keeps maxWidth 720 + padding 28/24 and loses nothing (it IS the 720 column). Keep
  `id="campus-feed"` on the section (tour step `selector: "#campus-feed"`, `campus-home.tsx:665`).
- `<aside class=left>`: `justify-self: end; position: sticky; top: 0; max-width: 320px;
  padding: 28px 0 24px 20px` (board values). `<aside class=right>`: mirror, `padding: 28px 20px 24px 0`,
  `flex-direction: column; gap: 12px` holding the fold strip + the Tonight panel.
- The media queries must be CSS (inline styles can't): add a small class block. Options: (a) a
  `<style>` string constant beside SHEEN_KEYFRAMES (`campus-home.tsx:4811`, rendered at line 982), or
  (b) globals.css near `.campus-feed-grid` (`globals.css:2541-2554`). (b) is cleaner; mind the
  existing `.campus-feed-aside` (hidden < 760) — use new names (e.g. `.tonight-grid`, `.tonight-left`).
- Only on the Feed tab and only when `!tagFilter`? Board doesn't say; recommend panels stay under a tag
  filter too (they're campus context), but the RollingStrip hides there. Visiting another campus: Tonight
  should follow the campus on screen (school feed is per-campus: IU Indy only for Indianapolis); "Your
  clubs" stays the student's own (like the strip's RSVP chips, C1). Hide Tonight's school part for any
  campus with no school feed configured (e.g. Bloomington v1) rather than showing an empty panel.
- `.vibe-app-shell` grid column `1fr` holds CampusHome; the `.campus-feed-grid` div (1099-1124) is flex
  column, so the new grid goes INSIDE FeedTabBody (or wraps TabBody for feed only). FeedTabBody is keyed by
  the tag filter (6767), so panels inside it refetch on every tag change: put the panel data hooks in
  CampusHome or a component outside the keyed FeedTabBody to avoid refetch flicker (or accept it).

Left panel "Your clubs" data (NO new route needed):
- members: `GET /api/me/inbox` -> `InboxClub[]` (`src/lib/chat/types.ts:457`): `org: OrgRef`
  (`types.ts:40`: id, handle, name, logo_url, banner_url, verified), `board.latest: Preview|null`
  (`types.ts:449`: text, created_at, author_name, kind), `board.room_id`, `board.unread`.
- followers: `GET /api/me/club-boards` -> `FollowedBoard[]` (`types.ts:493`: org, room_id, latest).
  `author_name` is always "" there (the Board speaks for the club). Show club name + Board line + age,
  never an author, on both lists.
- Existing callers to copy: `MessagesHome.tsx:145-154`, `MiniMessenger.tsx:37`. Both routes are unlimited by
  design ("NO LIMITER", club-boards/route.ts header) and 404 when the chat flag is off (it is `*`).
- Row link: `/messages?channel=<room_id>` (types.ts:495 comment). "See all" -> `/messages`. "Find clubs on
  campus" -> Orgs tab (`onTabChange("orgs")`; FeedTabBody doesn't have setTab today — pass a prop).
- Empty state (no clubs): board shows nothing for it; recommend the panel shows "Find clubs on campus" only.
- Mark tile: initials on `colorForOrg(id)` (`campus-home.tsx:278/285`) or the logo via
  `orgAssetProxyUrl` (imported at 104). Board used initials on a gradient; logos are club logos (fine, the
  "no logos" rule is about SCHOOL marks).
- Age: `relativeTime(iso)` (`campus-home.tsx:6995`) gives "3h", "20m", "2d" = the board's format. Reuse it.

Right panel "What's the vibe tonight?" props (one view-model for desktop, phone and Events):
- header: date eyebrow ("Sat, Nov 7", local), title "What's the vibe tonight?" (Fraunces 15/800).
- hero (#1): `reason: "featured" | "live" | "next"` -> "Featured by your school" / coral dot + "Happening now"
  / "Up next" on ONE line above the title (board note: it can't fit at the end of the tag row at 210px).
  `title` (sports: "IU Indy vs UT Martin" with italic muted "vs"; needs `opponent` split or a regex on " vs "),
  `subline` ("Men's basketball · Home"), tag "School event" + `host` ("Athletics"), `startsAt/endsAt`
  ("5:00 PM tip-off" for games; "9:00 PM to midnight"), `location`, `links: {label,url}[]` (Tickets,
  Watch on ESPN+ — only if the feed carries them; plain text + external-arrow, `tagInk` colour), and a
  `source` credit line + link back to the calendar (REQUIRED by the build brief; the boards don't draw one —
  add a quiet "From the IU Indy athletics calendar" line, as D2's school card does).
- DEVIATION FROM THE BOARDS (v1 constraint): no Going button and no "38 going" on school items (no RSVP
  storage for school events). The hero loses its Going row; keep the hairline + links row. Club rows keep
  their count only when `going_count >= 5`.
- "Also tonight": school rows (title, count-slot empty in v1, time + tail + place, "School event" + host),
  then "Also tonight from clubs": club rows (title, `going_count` if >=5, time · place, colour square +
  club name). Club rows open the club event: `onPickEvent(id)` (switches to Events and flashes it).
  "All in Events >" -> `setTab("events")`.
- Panel surface: NEW tokens needed (no app token matches): Night `rgba(0,0,0,0.24)` / Light
  `rgba(120,96,70,0.045)` tray; border `rgba(var(--scrim-rgb),0.10)` works in both; Tonight's glow
  `radial-gradient(320px 120px at 82% 0%, rgba(255,92,53,0.20)…)` Night / 0.12 + opaque `#F4F0EA` Light.
  Add `--side-panel`, `--side-panel-border`, `--tonight-bg` to BOTH `:root` (globals.css:80) and
  `:root[data-theme="dark"]` (globals.css:208). No shadow on the trays (board: "flat and framed").
- Row hover: board `rgba(127,120,112,0.12)`; app has `--row-hover` (light #F2EFE9 / dark #1F1D1C, globals
  149/247) but that's opaque, fine on the tray. Focus ring `2px solid #FF5C35` offset 2.
- Fonts: board writes `font-variation-settings: 'SOFT' 100` on Fraunces; NOT needed in the app: since
  5d3ddc6 the one font link loads Fraunces only at SOFT 100 (`src/lib/theme/fonts.ts:21`), so every
  `fontFamily: "Fraunces, serif"` is already soft. `relativeTime` (6995) already gives "3h"/"20m".

## 7. Phone Feed card (P2_Card) + sheet (P2_Sheet)

Shots: `shots/P2_Card.png` (+ `-featured`, `-now`, `-light`), `P2_Sheet.png` (half), `P2_Sheet-full.png`.

- CampusMobile layout: `<main>` 965; sticky banner wrapper 977-992 (`top: 0`, z 6, CampusBanner 64px +
  safe area); confirm banner / PushAsk 1003-1006; VisitingBanner 1007-1014; sticky tab strip header
  `#otto-mobile-tour-tabs` 1016-1035 (`top: calc(env(safe-area-inset-top) + 64px)`, z 5); horizontal pager
  `#otto-mobile-tour-feed` 1037-1068; panes use `paneStyle` (`CampusMobile.tsx:1328-1336`:
  `padding: 12px 16px 96px; gap: 10; flex column`).
- INSERT the card at `CampusMobile.tsx:1069-1076`: first child of the Feed `<section style={paneStyle}>`,
  BEFORE `<RollingStrip` (1076). The pane gap (10) spaces it from the strip. Board order: card, strip,
  cards. Hide it when there is nothing tonight (no placeholder: same rule as the strip) and, recommended,
  while a tag filter is on (`feedTag`), since the strip is the filter's control there.
- Card (board markup, P2_Card.dc.html "The tonight card" comment): one stretched link (whole card opens the
  sheet, `aria-haspopup="dialog"`), grid `minmax(0,1fr) 28px`, `padding: 12px 10px 12px 12px`, radius 18,
  surface = `var(--glass)` + `1px solid var(--glass-border)` + `var(--card-shadow)` (i.e. FeedCard's
  surface). Five fixed lines so height never changes: (1) coral 11px/800 "What's the vibe tonight? · Sat,
  Nov 7" (`var(--tag-ink)`) + right-end reason (Up next / coral dot + Happening now / Featured by your school,
  10.5px muted); (2) Fraunces 18/900 title (italic muted "vs" for games); (3) "School event" pill
  (`1px solid rgba(var(--scrim-rgb),0.2)`, 10.5/700) + byline "Athletics · Men's basketball"; (4) bold time +
  " · place · N going" (v1: NO count on school items); (5) "+N more tonight" 12/600 muted. Chevron tile 28px
  (`var(--paper-55)`, border `rgba(var(--scrim-rgb),0.06)`). Tickets/ESPN+ only in the sheet.
- Sheet: vaul `Drawer.Root` (import already at `CampusMobile.tsx:7`). Copy the PostActionsSheet layering
  (`CampusMobile.tsx:4056-4110`): overlay z 10000, content z 10001 (the tab bar is z 9988; `sheet-styles.ts`
  vaulOverlay z 1200 would sit UNDER the tab bar here). Scroll body like MutualsSheet
  (`MutualsSheet.tsx:207-214`: `maxHeight: calc(88dvh - 18px); overflowY: auto; overscrollBehavior:
  contain; data-vaul-no-drag`). Board has two detents (half 556 / full 780 on 844, grabber is a button that
  toggles); the repo has NO `snapPoints` use anywhere (vaul ^1.1.2 supports it) — recommend v1 = one height
  (~66dvh, content scrolls), no detents; a detent toggle is a follow-up.
  Board sheet surface `#161515` Night / `#FFFFFF` Light = `var(--paper)`; radius 24; scrim
  `rgba(0,0,0,0.40)`. Title row "TONIGHT · SAT, NOV 7" (Fraunces 11 caps `var(--tag-ink)`) + 44px close
  button; `Drawer.Title` required (visually-hidden style in `sheet-styles.ts:31`).
  Body order: hero (#1: reason line, tag + byline + count pill, Fraunces title, time + place, [Going]
  Tickets ↗ Watch on ESPN+ ↗, the rule line "First because it starts soonest. Your school can feature one
  event a day instead." with an (i) icon) -> "ALSO TONIGHT" (+ "All in Events >") school rows with a time
  column (72px) -> "ALSO TONIGHT FROM CLUBS" rows -> "THIS WEEK AT THE ARENA · IU Indy home games ·
  Athletics" 2-col tiles (past = muted "FINAL", tonight = coral-tinted tile "TONIGHT 5:00"). v1: drop Going
  and counts on school items; add the calendar credit + link.
- Club rows in the sheet: close the sheet then `pickEvent(id)` (`CampusMobile.tsx:467-480`, switches to
  Events and scrolls `#event-<id>`; handles visiting). "All in Events" -> `setTab("events")`.
- Data on the phone: club events are ALREADY loaded on mount (`events` state 294, `refetchEvents` 642-659,
  first load 753-758 with the feed), so "tonight from clubs" can be derived client-side from `events` (filter
  start today & not ended). Only the school feed is a new read. Desktop FeedTabBody has no events read: the
  desktop panel needs `/api/events` too (or one new `/api/tonight` that returns both, with a budget).
- Motion: card mount = `Reveal` (`src/lib/motion/Reveal.tsx:20`, SPRING_SOFT rise 8px). Press =
  `.vibe-press` class (`globals.css:2752-2790`, spring twin `--vibe-spring-snappy`). vaul runs its own
  transform transition (existing sheets accept it). Coral "live" dot: static (board has no pulse; any pulse
  must be transform/opacity behind prefers-reduced-motion).

## 8. Phone Events tab (P2_Events) and desktop Events (D2_Events)

Shots: `P2_Events.png` (+ `-school`, `-clubs`, `-featured`, `-now`), `D2_Events.png` (+ @1280/@1920, light).
Board rule (D2/P2 data comments): "All · School · Clubs filters the whole tab: Tonight AND the grid", All on
by default; "Also-tonight rows open the event card instead" (so tonight's club events STAY in Coming up
and the rows scroll to their card; the card keeps the only club RSVP and its event-chat line).

Phone `EventsPane` `CampusMobile.tsx:2456-2512` (props: events, loadErr, onRetry, onMutate, onRemoved,
onUpdated, visitingName):
- It early-returns for loading (2477-2479) and empty (2480-2492). INSERT a Tonight block + chips at the top
  of the returned fragment (2493-2510) AND restructure the early returns so Tonight still shows when club events
  are loading/empty/failed (school events are a separate source). New props: `tonight` view-model,
  `filter` + `onFilter` (state can live in CampusMobile so it survives swipes), `onOpenEvent`.
- Layout (P2_Events.png): chip row (All/School/Clubs, 32px pills) -> "Tonight" Fraunces 20 + date right ->
  hero card (glass card) -> "ALSO TONIGHT" card (school rows, hairline, "ALSO TONIGHT FROM CLUBS" rows) ->
  "Coming up" Fraunces heading -> the existing EventCards (`Reveal` + `EventCard`, 2495-2509).
- Tonight rows must NOT render `EventCard` or reuse `id="event-<id>"` (the card owns that anchor, 10659;
  `pickEvent` scrolls to it). Duplicate ids would break the strip's and Tonight's scroll target.

Desktop `EventsTabBody` (see section 5 for lines): insert chips + Tonight panel after the header row
(closes 10449), before the list switch (10451). D2 panel: surface `var(--paper)` + `1px solid
rgba(var(--scrim-rgb),0.10)` + a soft shadow, radius 18, `padding: 16px 22px 18px`; header "Tonight" Fraunces
20/800 + date 13/600 muted + the 28px open-orbit mark at right (SVG in D2_Events.dc.html: `M47.87 50 A24
24 0 1 1 54.44 40.5` stroke #FF5C35 @0.6 + dot r5 at 51.17,45.23); body = flex-wrap: hero
`flex: 1 1 320px` | vertical hairline | "Also tonight" + "Also tonight from clubs" rows (time column, title,
"School event" pill, host · place, count right if >=5, chevron). Then "Coming up" heading + the existing grid.
D2 also CENTRES the section (`margin: 0 auto`) and pads the right `max(24px, calc(734px - 50vw))` to keep
cards out of the orb lane; live today has neither (left-aligned at 10396-10406). Optional; flag to Franky.
- School events in "Coming up" (D2 draws one: "IU Indy vs Southern Indiana", "School event · From the IU Indy
  athletics calendar"): EventCard can't render them (needs `CampusEvent`, RSVP, Report, officer actions,
  `colorForOrg`). Needs a small `SchoolEventCard` (same DARK_GLASS_SURFACE look, no Going/Interested/Report,
  a "From the ... calendar ↗" link). D2 drew Going/Interested on it: v1 drops them (no RSVP storage).
- Chips: no token-based chip exists (`DiscoverFilterChips` 13609-13668 is hard-coded dark glass). Build one
  from D2 tokens: off = `var(--paper)` + `1px solid rgba(var(--scrim-rgb),0.14)` + `var(--ink-2)`; on =
  Night coral gradient over paper / Light `rgba(255,92,53,0.14)`, border `rgba(200,64,30,0.55)`; 32px tall,
  `aria-pressed`. Use the same chip on phone and desktop.
- Copy: the empty states "No upcoming events on campus" (10476) / phone "Nothing scheduled" (2487) become
  wrong under a School filter or beside school rows: say "No club events coming up" (or per-filter).

## 9. campus-home size risks and a file plan

- campus-home.tsx is 17,968 lines (not ~16k). Keep its diff to wiring only; put every new component in new
  files, e.g. `src/components/campus/tonight/`: `tonight-view.ts` (pure: rank, labels "Up next"/"Happening
  now"/"Featured by your school", count floor 5, "+N more", the "vs" split, filter All/School/Clubs; tested
  with node:test like `rolling-strip-view.test.ts`, which only `import type`s so React never loads),
  `use-tonight.ts` (data hook, parent-owned like `useStripData`), `TonightPanel.tsx` (C2 right),
  `YourClubsPanel.tsx` (C2 left + fold strip), `TonightCard.tsx` + `TonightSheet.tsx` (phone),
  `TonightSection.tsx` (Events, phone + desktop, `layout` prop), `EventFilterChips.tsx`, `SchoolEventCard.tsx`.
- CYCLE RISK: campus-home imports these; they must NOT import runtime values from campus-home
  (`useCampusView`/`CampusViewContext` 453-476 aren't exported anyway). `import type { CampusEvent }` is fine.
  Pass `campusId`, `isVisiting`, `onPickEvent`, `onOpenTab` as props. (RollingStrip follows this rule.)
  CampusMobile already imports `EventCard`/`CampusEvent` from campus-home (CampusMobile.tsx:9-19).
- Edit anchors that are unique in campus-home: `id="campus-feed"`, `maxWidth: 720,`, `title="What's coming
  up"`, `<EventsTabBody highlightEventId`, `function TabBody({`. NOT unique: `onPickEvent={onPickEvent}` (3),
  the `repeat(auto-fill, minmax(280px, 1fr))` grid (2). In CampusMobile: `<RollingStrip`, `function
  EventsPane({`, `{events.map((ev, i) => (` are unique. Keep each Edit under ~150 lines (workflow memory).
- campus-home wiring (estimated): TabBody gets `onOpenTab` (6746-6783 + CampusHome call 1108-1120);
  FeedTabBody wraps its section in the grid and mounts the two panels (~40 lines at 7204-7220 / 7367);
  EventsTabBody adds `filter` state + `<TonightSection>` + chips after 10449 and filters the grid map (10494);
  one CSS block for the 1400/1100 media queries (globals.css by `.campus-feed-grid` 2541-2554).
- Tag filter remount: FeedTabBody is keyed by the tag (6767); panels inside it remount (and refetch) on every
  tag pick. Either own the tonight/clubs hooks in CampusHome (outside the key) and pass data down, or accept it.
- Breakpoint gap: the desktop tree runs from 900px (`MOBILE_BREAKPOINT_PX`, use-is-mobile.ts:29). The C2
  rails hide below 1100, so a 900-1099 window (half-screen laptop, iPad landscape 1024) gets NO Tonight on
  the Feed, only in Events. Recommend: below 1100 show the phone's compact `TonightCard` at the top of the
  feed column above the strip (it opens a centered dialog or links to Events). Franky's call.
- Sticky works: no `overflow` on the ancestors (`.vibe-bloom-host` paints only a background, globals
  2607-2609; the bloom layer is `position: fixed`, 2633-2640). The grid needs `align-items: start` and the
  asides `align-self: start` or sticky never engages.
- Time: "tonight"/"Sat, Nov 7" should be the campus day (America/Indiana/Indianapolis), not the browser's
  zone; feed times are UTC. Re-rank on a timer (an event ending flips "Happening now"/"Up next"): copy
  `useEventEnded`'s timer pattern (11015-11030) or a 60 s tick.

## 10. Where the build must differ from the boards (v1 constraints) — tell Franky

1. No Going button and no "N going" on school events (boards draw both on the #1 and on school rows): v1 has
   no RSVP storage for school events. Club rows keep a count only when >= 5 (boards show "6 going" on Blitz
   night: under the rule it would be hidden).
2. A credit + link back to the source calendar on every school item (brief requires; boards only draw it on
   D2's school card: "From the IU Indy athletics calendar"). External links: plain text + ↗, new tab.
3. "Featured by your school": needs a pick source (who pins, where it's stored). With no new table, v1
   probably has no featured pick, so #1 is always "Up next"/"Happening now"; keep the label code path.
4. Tickets / Watch on ESPN+ only if the feed carries those URLs (the iCal feed may only carry the event URL).
5. "This week at the arena" (sheet) = athletics home games this week; past games read "Final" without a score.
6. D2 centres the Events section and pads its right for the orb; live Events is left-aligned (10396-10406).
7. Shared campus: Indianapolis is ONE campus for IU + Purdue (`src/lib/iu/campuses.ts:217`); the Jaguars are
   IU Indianapolis athletics. "Featured by your school"/"School event" for a Purdue Indy student is a copy
   question (the board copy assumes one school).
