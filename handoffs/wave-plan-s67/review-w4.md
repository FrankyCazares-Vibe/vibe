# Review — wave 4 (view any campus + 45-day lock)

Reviewer: W4f adversarial, read-only. 2026-09-27. Gate: tsc ok, node tests 969/970 (parse-reminder module-resolution failure pre-existing, not counted).

## Verdict (draft)
PASS WITH REPAIRS (final verdict at the bottom). No BLOCKER; 7 SHOULD, 8 NICE.

## Findings so far
See the table under "Findings (appending)".

## Checked and holding (server)
- E1: `resolveScopeV2` drops only the `allowed.includes` read block; `?campus=all` and the no-home "none" scope still use `allowedCampusIdsFor(system)` (own university). Tests pin it.
- R10: every campus read (feed, events, orgs discover, campus-map, zone, stats, trending, search) now goes through `resolveCampusRequest`; the no-system clamp returns 403 `campus_not_in_system` on a named campus. `school_system` is only written by `auth/school-email/confirm`, so unverified = no system = 403 holds.
- Writes untouched: home campus (`profile-campus-write.ts` only comments + constant), org create/PATCH (`allowedCampusId` against the actor's system, not in the diff), post campus (DB trigger, no migration), `users_campus_in_system` trigger (no migration).
- RSVP PUT: 403 `campus_visiting` keyed on viewer HOME (`users.campus_id`, service read) vs event campus (org campus, else creator campus) via pure `rsvpCampusDecision`; hidden-org 404 still first; any read error fails closed. DELETE ungated.
- Join route not in the diff: Request to join survives for visitors (S61 `visiting` reason).
- Search: `?campus=` only scopes events; absent = home (byte-identical at home). Trending already read `?campus=` (wave 1).
- 45 days: one `CAMPUS_CHANGE_COOLDOWN_DAYS`, copy built from it, banner test compares the two constants.

## Checked and holding (client)
- At home every URL is bare: `withCampus` returns the input untouched when nothing/home/unknown is named or home is still loading; strip `campusId` null at home; org page back link unchanged at home.
- Composer trap closed on both shells (desktop FeedComposer swapped for the note; phone FAB is the only entry and is hidden). "+ Create event" and the Create-club banner hidden on desktop too.
- Chat kept on both; Map pill/pane removed on closed visited campuses on both; desktop falls back to Feed, phone `setTab("feed")`.
- No `var(--muted|accent|border)` and no "clips" in the diff; new surfaces use C0 tokens or sit in already-dark chrome.

## Findings (appending)

No BLOCKER found. Every write check is untouched (org create/PATCH validate against the actor's system with `allowedCampusId`; home write, onboarding step and the DB trigger unchanged; the scope helpers are only called from GET handlers). Home URLs are byte-identical on both shells.

| # | Sev | File:line | Finding | Fix |
|---|---|---|---|---|
| 1 | SHOULD | src/app/api/campus-map/route.ts:274 (+ zone/route.ts:98) | R3 is client-only. `/api/campus-map?campus=<closed campus>` still returns that campus's majors, and `/api/campus-map/zone?campus=<closed>&major=X` still lists the students by name. Only the Map tab is hidden. | In both routes, when the scope is a named campus that isn't home and `!isOpen`, answer the empty payload (or 403 `campus_closed`). Add a campus-request test. Put it on the security sentinel list. |
| 2 | SHOULD | src/app/campus/campus-home.tsx:9138 (`setRsvp` early return) + RsvpButton `disabled` | While "visiting", both RSVP buttons are disabled and `setRsvp` returns before a DELETE. The route kept DELETE open so a student can take their name off an away event, but the card never lets them (campus page and org page). | While `rsvpAtHomeOnly`, keep the ACTIVE button tappable when `status !== null` (next = null → DELETE). Block only setting a new status. |
| 3 | SHOULD (ask) | src/lib/iu/campus-request.ts:150 `rsvpCampusDecision` | No carve-out for members. A visitor whose Request to join was approved (S61), or a member who moved home after 45 days ("keep their clubs and chats"), can chat in the club but can't RSVP to its events, on the org page too. | Ask Franky. Recommend exempting members of the event's club (route: an `org_members` read; page: `viewerRole != null`). |
| 4 | SHOULD | src/app/campus/campus-home.tsx:1083, src/components/mobile/CampusMobile.tsx:990 | The picker never shows "No students yet · still viewable" (plan §E, C5). Neither shell passes `counts`, and no endpoint serves them. | Add a per-campus `hasStudents` (service count, 0 vs >0 only) to `/api/campuses` and pass it on both shells. |
| 5 | SHOULD | public/html/profile.html:7912 | The legacy desktop profile's campus prompt still says "You can't change your campus again for 30 days." Visible copy is now wrong. | Change to 45 (and the comments at 7882-8980). One line, even if wave 5 owns the file. |
| 6 | SHOULD | events/route.ts:94-97, orgs/route.ts:152-154, stats/campus/route.ts:36-39, campus-map/zone/route.ts:37-41 | Route headers still say `?campus=` must be inside the viewer's university (403 otherwise). R1: the next reader "restores" the block. | Comment-only rewrite, pointing at the campus-scope.ts header. |
| 7 | SHOULD | supabase RLS `rsvps_insert_own`/`rsvps_update_own` | The `campus_visiting` gate is route-only. A student can upsert an RSVP on a visited campus's event straight over PostgREST. Same shape as the documented hidden-club gap (20260922100000). | A follow-up migration: a WITH CHECK DEFINER helper (event campus = caller's home, or unknown) next to the hidden-club check. Flag it for the sentinel. |
| 8 | NICE | src/components/campus/viewing-campus.ts:144 | The picker footer hard-codes "45 days"; the rest of the 45-day copy comes from `CAMPUS_CHANGE_COOLDOWN_DAYS`. | Build it from the constant. |
| 9 | NICE | supabase/migrations/20260916100000_campuses_school_system.sql:454 | The column comment still says "the 30-day change clock" (R9). | `COMMENT ON COLUMN` in the next migration. |
| 10 | NICE | campus-home.tsx:10585 vs CampusMobile.tsx:3051 | Drift. Visiting, the desktop hides Yours/Invited but its Following chip still lists every followed club. The phone narrows following and invites to the visited campus. | Apply the phone's narrowing on the desktop Following filter. |
| 11 | NICE | campus-home.tsx:502 vs CampusMobile.tsx:393 | Drift. Visiting, a strip RSVP chip for a home event takes the phone home and scrolls there. The desktop switches to the visited Events tab, where the card doesn't exist, and nothing highlights. | Desktop `onPickEvent`: if visiting, call `setViewing(null)` first. |
| 12 | NICE | viewing-campus.ts:143 | Picker intro "RSVPs and club chat stay on your home campus" overstates. Chat follows membership, the Chat tab stays and Request to join works while visiting. | "RSVPs stay on your home campus. Club chat is for clubs you've joined." |
| 13 | NICE | campus-home.tsx:4546 | Visiting, the banner keeps home's stats under the visited campus's name until the new `/api/stats/campus` answers. | Clear `stats` when `statsUrl` changes. |
| 14 | NICE | campus-map/route.ts:286 | `empty_copy` is emitted but no client reads it. The phone hard-codes the same line; the desktop has no visited empty-map copy. | Drop the field, or read it on both shells. |
| 15 | NICE | src/app/orgs/[handle]/page.tsx:228 | The back link is derived from the club's campus. A student who opened another campus's club from home (search, a profile) lands in visiting mode on Back. | Acceptable. Optional: carry `?from=` or read the referrer. |

## Verdict
PASS WITH REPAIRS. No security regression: reading opened as planned, the unverified clamp holds, `?campus=all` stays own university, and every write path and the trigger are untouched. Repair 1, 2, 5, 6 before the push (small). Ask Franky about 3. Put 1 and 7 on the security sentinel's list. 4 is a missing plan item: add it this wave, or record the deferral.
