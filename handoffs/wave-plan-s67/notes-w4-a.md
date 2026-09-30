# W4a (server) notes — view any campus + 45-day lock

Owner: batch a, wave 4. Scope: campus-enforcement.md E1, E2 (search), E3 (RSVP), E7, R1, R10; campus-map visited empty copy.

## Plan
- E1: delete the `!allowed.includes(row.id)` read block in `resolveScopeV2`; `?campus=all` and absent stay own university; `resolveCampusRequest` keeps the no-system clamp; write-side `allowedCampusId` untouched.
- R1: rewrite the three "settled" headers (campus-scope.ts, campus-request.ts, community-scope.ts).
- R10: feed route calls `resolveCampusRequest`.
- E2: search reads `?campus=` like stats/campus.
- E3: RSVP PUT → 403 `campus_visiting` via a pure helper + unit test; DELETE ungated.
- campus-map: named non-home campus empty answer → "Nobody's here yet."
- E7: `CAMPUS_CHANGE_COOLDOWN_MS` = 45 days + copy + the three tests.

## Decisions / log
- Feed route (R10): swapped `resolveScopeV2` → `resolveCampusRequest`; the inline viewer object is unchanged (minimal diff). Comment added.
- E1 done in `resolveScopeV2`: the `allowed.includes` read block is gone; `allowed` still bounds `all`/`none`/home. `CampusScopeForbidden` keeps both reasons (the clamp in `campus-request.ts` still returns `campus_not_in_system`).
- Headers rewritten: campus-scope.ts V2 block ("ANY KNOWN CAMPUS CAN BE READ … Do not restore it here"), campus-request.ts ("WHAT IS TRUE SINCE S67").
- `campuses.test.ts` holds the resolveScopeV2 tests (it is campus-scope.ts's test file too), so its scope-V2 "forbidden outside allowed set" test moves to the new rule there; nothing else in that file is touched.
- `campusScopeError` 403 line is now "Verify your school email to look around other campuses." (code unchanged). Since S67 only a no-system viewer can get it; the old "isn't part of your university" line would be false. Write-side copy (`CAMPUS_WRITE_COPY.campus_not_in_system`) is untouched.
- Search (E2): `?campus=` is read only by the events branch; a refused scope is remembered in a closure var and answered with `campusScopeError` after the fan-out (400/403 like stats/campus). People and orgs stay global. Header comment rewritten.
- Tests: campus-request.test.ts (verified IU → Purdue resolves, Purdue → IU-only, all 11 via CAMPUSES, `all` still own university, no-system → campus_not_in_system, unknown → unknown_campus), community-scope.test.ts (cross-university browse lane has no extras; campusScopeError test now uses a no-system viewer), campuses.test.ts scope-V2 test flipped. All green.
- RSVP (E3): pure `rsvpCampusDecision` + `eventCampusIdFor` + `RSVP_CAMPUS_VISITING_COPY` live in `campus-request.ts` (my owned pure file with a node test; importing `isVisitingOrg` from join-state, which has zero imports). Route: `blockedByHiddenOrg` → `rsvpBlocked(eventId, viewerId)`: event + viewer read in parallel (service), hidden org 404 first, then org campus ?? creator campus vs the viewer's home → 403 `{ok:false, error:"RSVP works on your home campus.", code:"campus_visiting"}`. Creator read skipped when the viewer has no home or the club has a campus. DELETE stays ungated (comment says why). NOTE for the sentinel: `rsvps_insert_own` RLS still lets a student upsert via PostgREST directly; the gate is route-level, same as the hidden-org 404.
- campus-map: a named campus never hit `pickYourCampus` (only kind "none" does), so the "Pick your campus" copy could not appear for a visit. Added an additive `empty_copy: "Nobody's here yet."` on the normal answer when the viewed campus isn't home and both majors and orgs are empty. W4c/W4d may read it (or ignore it: the key is absent otherwise). Header comment rewritten.
- E7: `CAMPUS_CHANGE_COOLDOWN_DAYS = 45` (new export) and `CAMPUS_CHANGE_COOLDOWN_MS = DAYS * DAY`. The Settings copy (`CAMPUS_CONFIRM_LOCK_COPY`, `CAMPUS_SWITCH_LOCK_COPY`) and the banner's `CAMPUS_CONFIRM_LOCK_NOTE` are template strings built from the day count, so copy can't drift from the rule. The banner test used to grep settings-campus-card.ts for the JSON literal; it now imports `CAMPUS_CONFIRM_LOCK_COPY` and compares (and pins "45 days" once in words).
- Tests moved to 45: onboarding-prefill.test.ts (new constant test; day 44 now too_soon; 31/40-day "after" cases → 46), settings-campus-card.test.ts (dates: Nov 1), profile-campus-write.test.ts (OLD = lock + 1 day; "October 25"), campus-confirm-banner-view.test.ts.
- Clock start: unchanged mechanics. The onboarding campus step stamps `campus_set_at` on every save and `campusChangeDecision` only bites once `onboarded`, so the lock effectively starts when onboarding finishes with a campus; the confirm "Yes" re-sends the campus with a null stamp → write → stamp. Every later change restamps.
- Comment-only 30→45 in profile-campus-write.ts, onboarding-step/route.ts, SettingsClient.tsx (538-544), ProfileMobile.tsx (1239-1245, 1498).
- NOT MINE, still say 30: `public/html/profile.html:7912` VISIBLE copy `_CAMPUS_SWITCH_LOCK_COPY = "You can't change your campus again for 30 days."` (legacy desktop profile; wave 5 / orchestrator), comments in `me/profile/route.ts:259,373`, `me/profile-sync/route.ts:315`, `CampusConfirmBanner.tsx:28`, `school-email-domains.ts:422`, `onboarding/finish.ts:195`, migration column comment.

## Verification
- node tests (all green): campus-request 31, community-scope 48, campuses 27, onboarding-prefill 26, settings-campus-card 23, profile-campus-write 23, campus-confirm-banner-view 10, join-state 46 (untouched, re-run).
- `npx tsc --noEmit`: no errors in W4a files. Sibling errors at the time of the run: `campus-home.tsx:10424,10447` (`discoverUrl` undefined, W4c) and `CampusMobile.tsx:2910` (`viewingId`/`homeId` props on a component that takes none, W4d).

## For the reviewer / siblings
- W4c/W4d: `/api/campus-map` may carry `empty_copy: "Nobody's here yet."` on a visited empty campus (absent otherwise). `/api/search?campus=<id>` scopes events; `/api/feed` 403 is now only for no-system viewers, with the line "Verify your school email to look around other campuses."
- Comments in routes I don't own still describe the old 403 for the other university: `events/route.ts:96`, `orgs/route.ts:154`, `stats/campus/route.ts:38`, `trending/hashtags/route.ts:42`, `campus-map/zone/route.ts:38`. Comment-only; worth a follow-up so nobody "restores" the block.
- No migration written (the optional `COMMENT ON COLUMN users.campus_set_at` needs a DB write; out of scope for an agent).

## Repair round 1

Four items from the W4 review. Ownership check first: my dirs are `src/lib/iu/`, `src/app/api/{feed,search,events,campus-map,me/onboarding-step}/`, `src/lib/profile/`, the banner view. So `events/route.ts` and `campus-map/zone/route.ts` are mine (under my dirs); `orgs/route.ts` and `stats/campus/route.ts` are NOT (comment fix listed for the orchestrator).

Plan:
1. R3 map on closed campuses: a pure `mapCampusClosedFor(scope, viewer)` in `campus-request.ts` (tested); both map routes answer the empty payload when the named campus isn't home and isn't open. Sentinel list line.
2. Member exemption for RSVP: product call, not made here. Recorded as an open question with the recommendation (no code change).
3. Stale headers: rewrite events/route.ts and campus-map/zone/route.ts; flag orgs + stats for their owners.
4. RLS for RSVP: migration file only (never applied by me), SECURITY DEFINER helper mirroring the route rule.

### Done so far (repair 1)
- Item 1 (R3, map on closed campuses): pure `mapCampusClosed(scope, viewer)` in `campus-request.ts` = named campus, not home (home via `resolveScopeV2(null, viewer)`, same as `homeCampusIdFor`), and `!isOpen`. `/api/campus-map` answers `{ok, you, majors: [], orgs: [], campus_id, campus_scope, reason: "campus_closed"}` before any read (the clients only special-case `reason === "no_school"`, so today's bundles draw an empty map; checked `campus-home.tsx:12093`, `MapMobile.tsx:333`). `/api/campus-map/zone` answers `emptyBuckets()` for the major AND org zone. No 403: a new error code would need client handling, the empty payload needs none. Home is always drawn even when closed (a Bloomington student sees their own map). `?campus=all` untouched (own university; mixed campuses, pre-S67 behaviour). 5 new tests in `campus-request.test.ts` (36 green), one iterates `CAMPUSES` so a campus that opens later flips automatically.
- Item 3 (stale headers): rewritten in `events/route.ts` (SCOPING paragraph) and `campus-map/zone/route.ts` (SCOPE paragraph), both pointing at the `campus-scope.ts` header. NOT MINE, still stale: `src/app/api/orgs/route.ts:152-154` and `src/app/api/stats/campus/route.ts:36-39` (and `trending/hashtags/route.ts:42` from round 0). Suggested text for their owner: "Since S67 `?campus=<id>` may be any known campus, either university (see the header of `src/lib/iu/campus-scope.ts`; do not restore the own-university 403). Only a viewer with no university is refused (403 `campus_not_in_system`, `resolveCampusRequest`); an unknown id is 400."
- Item 2 (club members and RSVP): a product call, so NO code change. Recorded for Franky with the reviewer's recommendation: exempt members of the event's club (route: an `org_members` read for the viewer when `rsvpCampusDecision` says `campus_visiting`; org page: `visiting=false` when `viewerRole != null`, W4e's file). If he says yes, `rsvpCampusDecision` gains a `viewerIsMember` input and the migration helper gains the same arm IN THE SAME DEPLOY (the DB must never refuse what the route allows, or a member gets a 500).
- Item 4 (RLS): NEW `supabase/migrations/20260927100000_rsvp_home_campus_rls.sql`, written only, NOT applied (no DB access; I never touch one). `public.rsvp_on_home_campus(p_event_id)` STABLE SECURITY DEFINER, `search_path = ''`, EXECUTE to anon/authenticated/service_role (standing rule, nothing revoked): false only when the event's campus (club's, else creator's) and the caller's home are both known and differ; false for anon. `rsvps_insert_own` / `rsvps_update_own` WITH CHECK = the 20260923090000 text word for word + the helper; UPDATE USING and DELETE untouched. Pre-flight aborts if the two policies don't read as moderation left them, if another permissive write policy exists, if RLS is off, or if the name is taken; post-check verifies the helper's shape and grants and that both policies ask it. Header has LIVE STATE: NOT READ, apply steps (management API + schema_migrations row 20260927100000) and a one-transaction ROLLBACK. The hidden-club check stays its own follow-up (noted in the header; `org_content_visible` makes it one line). Ownership: the waves.md W4a row lists an optional migration; this is that slot.

### For the security sentinel (add to its list after wave 4)
1. `/api/campus-map?campus=<closed, non-home>` → `majors: []`, `orgs: []`, `reason: "campus_closed"`; `/api/campus-map/zone?campus=<closed>&major=<m>` and `&org=<h>` → empty buckets. Home (even closed) and Indianapolis still draw. Watch for any new route that lists users by `campus_id` without `mapCampusClosed`.
2. RSVP over PostgREST: once 20260927100000 is applied, `POST /rest/v1/rsvps` (and upsert/PATCH) for an event on another campus must fail RLS; until then it succeeds (route-only gate). Hidden-club RSVP over PostgREST is still open (20260922100000 KNOWN GAP).
3. Unchanged from round 0: cross-system reads opened on feed/events/orgs/map/stats/search; `?campus=` on search (events branch) and trending; RSVP 403 `campus_visiting`.

### Verification (repair 1)
- node tests: campus-request 36 (5 new), community-scope 48, campuses 27. All green.
- `npx tsc --noEmit`: clean (no errors anywhere at the time of the run).
- The SQL was not executed anywhere (no database access by rule); pre-flight/post-check are there so a bad apply aborts whole.
