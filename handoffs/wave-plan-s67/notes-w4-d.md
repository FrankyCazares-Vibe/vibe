# W4d notes — phone twin of "Viewing Bloomington"

Owner: batch d. Files: `src/components/mobile/CampusMobile.tsx`, `src/components/mobile/MapMobile.tsx`, `src/components/mobile/onboarding/StepClubs.tsx` (comment only).

## Plan
- `useViewingCampus()` (W4b, `src/components/campus/viewing-campus.ts`) in `CampusMobile`; every campus fetch through `withCampus(url, viewingId, homeId)`.
- Header: "Campuses ▾" button (≥44px) opening `<CampusBrowsePicker variant="sheet">`; banner title + eyebrow follow the viewed campus ("IU · JUST LOOKING" when visiting).
- `<VisitingBanner>` under the header when visiting.
- FAB hidden when visiting; dashed one-line note at the top of the Feed pane: "You're just looking. New posts go to <home>."
- Chat tab kept. Map tab hidden when the viewed campus isn't open.
- RSVP disabled + italic "RSVP works at home" in EventsPane.
- Strip: `visiting` + `useStripData({ campusId })`.
- Visited empty copy: "Nobody's posted here yet." / "No events here yet." / "No clubs here yet."
- 400 `unknown_campus` / 403 `campus_not_in_system` → LoadFailed with "Back home".
- At home nothing changes (bare URLs).

## Log
- Read contracts C0/C5, plan E, waves W4, campus-enforcement, critique-product 2-7, the canvas `VisitingPhone.dc.html` board (header 64px with "Campuses ▾" 38px pill at right; coral pill `Viewing X · home is Y` + charcoal Back home; tabs Feed/Events/Clubs/Map, no Chat in the mock but the task says Chat STAYS; RSVP buttons disabled + italic "RSVP works at home"; dashed note "You're just looking. New posts go to Indianapolis." with a pencil glyph).
- StepClubs.tsx: comment only (stays home, never `?campus=`). DONE.
- Home id on the phone: `useViewerCampus()` exported from campus-home (same cached /api/campuses read the banner uses) → `.campusId`.
- W4b notes say `useViewingCampus(homeId)` takes the home id as an argument and the picker's variant is `"drawer" | "modal"` (task text says `variant="sheet"`); will adapt to whatever lands.
- `CampusBanner` (title/eyebrow/Campuses button) lives in campus-home.tsx = W4c's file. Siblings aren't messageable; plan: pass whatever props W4c adds; if none, overlay the Campuses button on the phone banner's wrapper and report the title/eyebrow gap.
- Orgs while visiting: discover gets `withCampus`; following (never campus-scoped server-side) and invites are filtered on the client to the viewed campus so "No clubs here yet." can show and home clubs don't pose as the visited campus's.
- "Back home" on a refused scope: a LoadFailure with `action: {label: "Back home", href: "/campus"}` (LoadFailed does a full navigation to the action href).
- W4b landed `viewing-campus.ts`: `useViewingCampus(homeId)`; `viewingId` = home when nothing named; `withCampus` bare at home and before home loads. So the phone keys its loads on the URL STRINGS (`feedUrl`, `eventsUrl`, `discoverUrl`), which only change when the campus on screen does: no double fetch at home when `/api/campuses` answers late.
- W4c is adding a `CampusViewContext` in campus-home.tsx that `CampusBanner` and `EventCard` read (default = home). Waiting to see whether it's exported so the phone can provide it (banner title/eyebrow/RSVP follow the viewed campus).
- CampusMobile so far: imports; `campusLoadFailure` (Back home on unknown_campus / campus_not_in_system); viewing state + `mapHidden` + `tabOrder`; strip `campusId`; render-time reset of every list on a campus change; feed/events/orgs-discover/tag feed through `withCampus`; orgs seq bump on campus change; FeedPane/EventsPane/OrgsPane visited empty copy; OrgsPane narrows following/invites to the visited campus; TabStrip takes `order`.
- W4c's `CampusBanner` reads `?campus=` itself when no view is provided (the phone), and takes `onOpenCampuses` (44px button on the phone). The phone passes it. `EventCard` takes `visiting` (the org page passes the same flag); the phone passes `visiting` on the Events pane.
- `CampusBrowsePicker` (W4b): `variant="sheet"`, `open`, `homeId`, `viewingId`, `homeChangeAvailableAt`, `onPick`, `onClose`. The home row's lock date: only `/api/me/profile-bootstrap` returns `campusChangeAvailableAt`, so the phone reads it lazily the first time the picker opens (quiet; failure → the row says "Home").
- Render: VisitingBanner takes the confirm/push slot while visiting (hidden on Map like that slot; push ask suppressed while visiting); dashed `VisitingComposerNote` after the strip; FAB hidden while visiting; Map pane unmounted when the visited campus is closed; Map keyed by its campus URL; search overlay takes optional `viewingId`/`homeId` (ProfileMobile passes neither = home).
- MapMobile: props `viewingId`/`homeId`; `/api/campus-map` + zone through `withCampus`; refusals → Back home; visited empty copy "Nobody's here yet." / "Once students pick <name>, their majors light up as zones."
- Strip event chip while visiting: the chips are the student's own RSVPs (usually home), so a chip whose event isn't in the visited list goes home first (`lookAt(null)`) and scrolls to `#event-<id>` once home's events load (pending ref + effect). A chip whose event IS on the visited campus scrolls as before.
- `campusLoadFailure` has ONE phone copy, exported from MapMobile (CampusMobile already imports MapMobile; a CampusMobile export would be a cycle). The desktop keeps its own in campus-home.tsx. Candidate to move into viewing-campus.ts (W4b's file) later.
- Left alone: `EmptyTab`'s pre-existing light literals (`rgba(255,253,248,0.6)` has no Light-exact token; tokenising only its inks would make Night worse). Readable in Night today (dark ink on grey).
- `npx tsc --noEmit`: clean (whole tree, with the siblings' work in place).
## DONE

## Repair round 1
Item (SHOULD, review-w4 #4): the picker never shows "No students yet · still viewable" because neither shell passes `counts` and no endpoint serves them.
- **Deferred, no code change here.** The data has to come from the server, and `/api/campuses` (`src/app/api/campuses/route.ts`) is in no Wave 4 batch's Owns list, so batch d can't add it. The phone also reads `/api/campuses` through `useViewerCampus()`, which lives in `campus-home.tsx` (W4c's file), so wiring it in means a change to that hook as well.
- Rejected workaround: calling `/api/stats/campus?campus=<id>` once per campus when the sheet opens. That's 11 requests every time the picker opens, and it tells us the same thing as a single server-side count.
- Recipe for whoever owns it next. (1) In `/api/campuses`, add `hasStudents: Record<campusId, boolean>` covering every campus in `CAMPUSES`. Use the service role with one head-count per campus (`count: "exact", head: true`), or a single grouped RPC. Send only 0 vs >0, never a number. (2) Have `useViewerCampus()` pass the map through. (3) Phone: pass `counts={hasStudents ? Object.fromEntries(Object.entries(hasStudents).map(([id, has]) => [id, has ? 1 : 0])) : null}` on the `<CampusBrowsePicker variant="sheet">` in CampusMobile.tsx (~line 990). The desktop needs the same one-prop change at campus-home.tsx:1083. The picker already renders the 0 case, so nothing changes there.
- Privacy note for that change: a true/false per campus shows that at least one student is on a campus, but never who. The banner's "N on Vibe" already shows the exact number for the campus on screen, so this reveals less than what's already public.
- Until then every campus row reads as a normal "View <campus>" row. That's the safe way to fail, because it never says "not open yet".
- `npx tsc --noEmit` after repair round 1: clean (no code change in this round).
