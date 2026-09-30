# W4e notes: the org page while visiting (contracts C5, W4e row)

Owner: batch e (wave 4). Owns ONLY `src/app/orgs/[handle]/OrgEventsSection.tsx` and `src/app/orgs/[handle]/page.tsx`.

## What I'm doing
- `page.tsx` already learns the viewer's HOME campus: `loadViewerOrgContext` reads `users.school_system, campus_id, is_platform_admin` (`src/lib/orgs/membership.ts`), returned as `ctx.viewer.campus_id`. No new query. The club's campus is `orgRaw.campus_id` (already selected).
- Visiting = `ctx?.ok && isVisitingOrg(campusId, ctx.viewer.campus_id)` (the S61 rule in `join-state.ts:262`, both known and different). A failed membership read = not visiting (RSVP stays live; the server's 403 `campus_visiting` is then the answer, and EventCard maps it).
- `OrgEventsSection` takes `rsvpAtHomeOnly` and hands it to each `EventCard` (the shared card lives in `campus-home.tsx`, owned by W4c).
- Back link (`TopNav`): `/campus?tab=orgs` at home; `/campus?tab=orgs&campus=<club campus>` when visiting, so Back returns to the campus the student was browsing.

## Decisions so far
- The org page paints its own always-dark backdrop (BACKDROP_PRESETS); C0 says "anything inside already-dark chrome (... org backdrops ...) is left alone". Any new text I add on that backdrop keeps the page's `rgba(255,255,255,x)` inks, which read the same in Light and Night (the backdrop does not flip). C0 tokens would flip to dark ink in Light and vanish on the purple backdrop.
- EventCard is not mine. The disabled RSVP, the italic "RSVP works at home" and the 403 `campus_visiting` copy go inside EventCard (W4c). I only pass the flag.

## Log
- page.tsx done: `isVisitingOrg` imported; `visiting` + `backHref` computed right after `invite` (comment explains); `TopNav` takes `backHref`; `OrgEventsSection` gets `rsvpAtHomeOnly={visiting}`. Back href built with `URLSearchParams` by hand, not W4b's `withCampus`: this is a server component and `withCampus` lives next to a client hook (and resolves against the window origin).
- Coordination gap: EventCard (campus-home.tsx, W4c) has no "visiting" prop yet and today swallows every RSVP failure silently (catch → rollback, no toast). Polling campus-home.tsx for W4c's prop name before wiring OrgEventsSection.
- OrgEventsSection done: `rsvpAtHomeOnly?: boolean` (default false), doc comment, passed as `visiting={rsvpAtHomeOnly}` to EventCard. `visiting` is a GUESS at W4c's prop name (nothing in campus-home.tsx yet); a background watcher is waiting for W4c's EventCard signature so the name can be matched before I finish.
- W4c landed `EventCard({ ev, onMutate, visiting?: boolean })` (campus-home.tsx ~9106): `visiting ?? useCampusView().isVisiting`, disabled buttons titled "RSVP works on your home campus", italic "RSVP works at home", and a 403 `campus_visiting` answer flips the card to that state + toasts "RSVP works on your home campus." The guessed prop name `visiting` matches; no change needed.
- page.tsx revised: `visiting` now uses W4a's `rsvpCampusDecision({ orgCampusId, creatorCampusId: null, viewerCampusId })` from `src/lib/iu/campus-request.ts` (the RSVP route's own rule, canonical ids via `campusRowById`), not raw `isVisitingOrg`, so the page disables exactly where the route refuses. Back href uses the canonical id. A campus-less club leaves each event to its creator's campus (the route knows; the card's 403 path covers it).
- `npx tsc --noEmit`: nothing in my two files. Errors seen belong to siblings mid-flight (campus-home.tsx:1081 `onOpenChange` on CampusBrowsePicker; CampusBrowsePicker.tsx missing style constants; CampusMobile.tsx:2868 props on a no-prop component).
- Night: the org page's backdrop is always dark (its presets) and EventCard is dark glass; I added no colours, so nothing to token.
