# W4c notes: desktop campus-home.tsx, viewing any campus

Owner: batch c (wave 4). Owns ONLY `src/app/campus/campus-home.tsx`.

## Plan
- `useViewingCampus()` from `@/components/campus/viewing-campus` (W4b writes it; trusting C5 signature). Home id from `useViewerCampus()` in this file.
- Every campus fetch through `withCampus(url, viewingId, homeId)`: feed, events, orgs discover, campus-map, zone, stats, strip trending (via `useStripData({campusId})`), search.
- "Campuses" button in the banner row opens `<CampusBrowsePicker variant="modal">`.
- Visiting: `<VisitingBanner>` under the banner; composer -> dashed note; Chat kept; Map hidden when viewed campus not open; RSVP disabled + tooltip + italic note; audience-mismatch Join rendered as "<IU|Purdue> students only"; visited empty copy; strip `visiting`; 400/403 unknown_campus/campus_not_in_system -> LoadFailed with "Back home".

## Log
- Read all docs + the phone VisitingPhone board. W4b's hook is `useViewingCampus(homeId)` (their notes).
- CampusBanner + EventCard are SHARED (CampusMobile imports both; OrgEventsSection imports EventCard). Design:
  - A `CampusViewContext` provided by CampusHome (default = home, `provided:false`), read by FeedTabBody, EventsTabBody, EventCard, OrgsTabBody, DiscoverCard, MapTabBody, ZonePanel, CampusSearchBar.
  - CampusBanner ALSO calls `useViewingCampus(viewer.campusId)` itself and prefers the context when provided, so the phone banner follows `?campus=` with no change on W4d's side. New optional prop `onOpenCampuses` renders the "Campuses" button (44px when `compactSearch`).
  - EventCard gets `visiting?: boolean` (prop wins, else context), so W4d/W4e can pass it.
- Decisions: while visiting also hide "+ Create event", the Create-club banner and the orgs "Yours"/"You're invited" side groups (home things; same trap as the composer; and "Yours" would mask "No clubs here yet."). Map tab derived-hidden (tab falls back to feed) when the viewed campus isn't open.
- W4b's viewing-campus.ts landed: `useViewingCampus(homeId)` syncs instances through `useSearchParams` (replaceState), `viewingId` = named campus else home; `VISITING_COPY`, `visitingEyebrow`, `visitingComposerNote`, `isOpenCampus` used from it.
- DONE in CampusHome: context value (`campusView`), `mapHidden` → derived `shownTab`, VisitingBanner row under the banner, picker mount (API guessed until W4b's component lands — re-check), TabBody keyed by viewed campus (remount on switch).
- DONE: CampusTabs `hideMap`; CampusBanner follows the viewed campus (title, tile, colour, "IU · JUST LOOKING" sub, stats via withCampus) + `onOpenCampuses` "Campuses" button (hover + coral focus-visible via a tiny <style>); CampusSearchBar via view.url; Feed tab (url, strip campusId + visiting, eyebrow, composer → VisitingComposerNote, empty copy, Back-home failure).
- DONE: Events tab (url, eyebrow, "+ Create event" hidden while visiting, visited empty copy, Back-home failure). EventCard `visiting?: boolean` (W4e's OrgEventsSection already passes `visiting={rsvpAtHomeOnly}` — matches), RSVP off via RsvpButton `blockedTitle` (title + aria-label + 0.45 opacity), italic note beside (row wraps on narrow cards), 403 `campus_visiting` → toast "RSVP works on your home campus." and the card flips to its at-home state.
- Picker mounted per W4b's real API (`open`, `onPick(id)`, `onClose`, `homeChangeAvailableAt`). The 45-day date comes from `/api/me/profile-bootstrap`'s top-level `campusChangeAvailableAt`, read once on first open (quiet). No `counts` source on desktop, so "No students yet · still viewable" never shows here (open question).
- DONE: Orgs tab (discover URL built as a string outside the effect so home never refetches when its id arrives; eyebrow + Verified hint follow the view; Create-club banner and the Yours/Invited side groups hidden while visiting; "No clubs here yet."; Back-home failure). DiscoverCard: visiting + `audience_blocked` → a dashed "Purdue students only" status where Join would be (title = the notice sentence); the control itself already shows Follow only.
- DONE: Map tab + ZonePanel via view.url (string deps), eyebrow follows the view; search event rows keep `?campus=` (goEvent via view.url).
- Lint finding: passing the context object into a helper (`viewLabel(view, …)`) made the React Compiler bail on MapTabBody's memos (3 new `preserve-manual-memoization` errors). Inlined `view.isVisiting ? view.label : homeLabel` everywhere and deleted the helper; eslint now shows only the 6 pre-existing warnings (baseline had 7; goEvent's literal is gone).
- Trimmed CampusView to what's read (`provided, viewingId, homeId, isVisiting, label, url`).
- Final: `npx tsc --noEmit` clean (whole repo, siblings included).

## For the reviewer / orchestrator
- CampusBanner now owns the "Campuses" button behind `onOpenCampuses` (desktop passes it). The phone banner already follows `?campus=` (title, colour, "IU · JUST LOOKING", stats) with no change in CampusMobile; W4d can pass `onOpenCampuses` to get the 44px button in the header instead of adding its own.
- EventCard `visiting` prop name matches W4e's OrgEventsSection. CampusMobile's EventCard mount (W4d) should pass `visiting={isVisiting}`; if it doesn't, the 403 `campus_visiting` answer still flips the card with the "RSVP works on your home campus." toast.
- Beyond the brief (same R5 trap as the composer): "+ Create event", the Create-club banner, and the Orgs "Yours"/"You're invited" groups are hidden while visiting.
- Picker `counts` not passed (no per-campus count source on desktop), so "No students yet · still viewable" never shows on desktop.

## Repair round 1
- SHOULD (EventCard RSVP away from home can't be taken back): valid. The route keeps DELETE open (S67 E3) but `setRsvp` returned early on `rsvpAtHomeOnly` for every tap, and both buttons carried `blockedTitle` (disabled).
  Fix: `setRsvp` refuses only a NEW status while away (`rsvpAtHomeOnly && next !== null`); the button that holds the student's current status stays live (no `blockedTitle`) so a tap sends DELETE. The other button stays blocked (a switch Going ↔ Interested is a PUT, which the route refuses). After the DELETE lands, status is null and both buttons go back to the blocked state; the italic "RSVP works at home" note stays throughout. The live button gets an aria-label/title saying the tap takes the name off, so it doesn't read as a new RSVP. Applies on the campus page, the phone, and the org page alike (all mount this EventCard).
- Done: `setRsvp` guard, per-button `blockedTitle` only on the non-active button, new RsvpButton `removeHint` (title + aria-label "Going. Tap to take your name off"; not dimmed; sizes to its words like the blocked one so the note still fits). Constant `RSVP_REMOVE_HINT` next to `eventCardSubtleLink`. EventCard `visiting` doc comment updated. `npx tsc --noEmit` clean.
