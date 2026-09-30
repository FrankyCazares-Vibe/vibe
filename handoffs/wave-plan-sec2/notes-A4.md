# Notes: A4 club events (builder)

Started 2026-09-27. Read plan.md, waveA-build.md, approach-A4.md, critique-A4.md, cross/product lines, findings #11/#12 + Lows.

## Spec I'm building (waveA-build overrides approach)
- Versions: 20260928110000_club_events_rules.sql (BEFORE deploy), 20260928130000_events_insert_service_only.sql (AFTER deploy).
  (approach-A4 said 130000/130500; waveA-build renumbered. Using waveA-build.)
- 110000: can_manage_event (club -> current owner/admin only; org-less -> creator), search_path '';
  events DELETE rewrite (current officers; org-less creator); revoke all 6 UPDATE column grants + drop events_update_creator;
  length CHECKs (title 1..120, description <=2000, location <=200); 14-day duration CHECK; past-start guard (insert only);
  events_org_id_fkey -> ON DELETE CASCADE; event_org_visible() + rsvps_insert_own clause;
  event_visible: no creator bypass for club events.
- 130000: revoke INSERT on events from authenticated + drop events_insert_authenticated.
- Code: POST inserts with service role + rate limit + 14-day cap; GET viewer_can_manage = org ? officer : creator;
  campus list verified filter; creator identity not shipped for club events (keep id-only inner join so a suspended
  officer's events still drop off: product call 8); attendees route -> can_manage_event RPC + isUuid.

## LIVE STATE read 2026-09-27 via read-only MCP (matches critique)
- 8 events/rsvps policies text identical to critique-A4 "Live facts". events relacl authenticated=ard; column UPDATE (w)
  on id, org_id, creator_id, starts_at, ends_at, created_at. rsvps authenticated=arwd.
- Functions: can_manage_event SECDEF stable search_path=public (creator OR officer); event_visible SECDEF search_path=public
  (anon guard; creator OR (org not hidden OR member) OR own rsvp); org_content_visible search_path '' (TRUE for NULL);
  all EXECUTE anon/authenticated/service_role. event_org_visible does not exist.
- Callers: event_visible <- events_select_visible + event_rsvp_counts; can_manage_event <- rsvps_select_own_or_manager only.
- Constraints: events_check (ends>=starts), creator FK CASCADE, org FK SET NULL. No triggers on events/rsvps.
- Counts: 13 events, 0 org-less, 0 bad title/desc/loc, 0 over 14 days (max 2h), 12 past start, 0 on unverified,
  3 on hidden, 0 creator-not-officer; 7 rsvps, 0 non-member rsvps on hidden-club events. last live mig 20260927142000.
- NOTE: the MCP read role lacks EXECUTE on org_member_role (42501) so counts use joins on org_members.
- Local DB == prod: md5 of events+rsvps policies 119cd85e0dfb492ebdfd81cfa9c42a18 and of the 4 helper defs 97e3f0221f48227e7ab26dab3733a347 match on both.
- Local fixtures: test_invite_club (verified; avery owner, emery admin; events Kickoff by avery, Welcome Mixer by emery [past]),
  test_open_club (UNVERIFIED, 1 upcoming event by avery: will leave the CAMPUS list after the verified filter; still on the club page),
  test_request_club (unverified, blake owner), test_hidden_club (hidden+unverified, avery owner, 0 events). avery is_platform_admin=true locally.
- scripts/local-seed.mjs:398 inserts a PAST event with the service role -> a past-start rule that binds service_role would break the seed.

## Decisions (builder)
- #11: revoke INSERT (critique path), in 130000 AFTER deploy. Route inserts with the service role after its checks.
- PAST-START GUARD: NOT a CHECK and NOT a service-role-binding trigger. Evidence: 12/13 live events are past (a now() CHECK
  can't be added), and scripts/local-seed.mjs:398 inserts a past event with the service role (a trigger binding every role
  breaks the local seed). So: 110000 ALTERs events_insert_authenticated (restated word for word) + `starts_at >= now() - 10 min`
  (5 min looser than the route: absorbs app/DB clock skew, so the old route never 500s) + org_id not null + club verified and
  not hidden. That closes #11 (except the word filter) for the window before 130000. After 130000 the route is the only writer.
  Length + 14-day duration ARE real CHECKs (bind the service role too).
- Club verified/hidden check inline in the INSERT policy (no new helper): authenticated has table SELECT on orgs and the
  policy's org_member_role arm already requires the caller to be an officer = member, so orgs_select shows them the row.
- src/lib/events/manage.ts (+ test): constants, eventTimesProblem (adds the 14-day cap), viewerCanManage, withoutClubCreator.
  The test reads the 110000 file and asserts the same numbers (drift guard).

## Local migration loop (110000)
- Applied 110000 locally: PRE-FLIGHT + catalog/behaviour POST-CHECK passed (CHECK probes, stranger, per-member can_manage_event).
- Ran the header ROLLBACK (extracted verbatim): policy md5 back to 119cd85e..., helper md5 back to 97e3f022..., column
  UPDATE grants back. Re-applied: passes again. So the ROLLBACK is exact and the PRE-FLIGHT accepts the rolled-back state.

## Local probes (each in BEGIN ... ROLLBACK, as the real role with request.jwt.claims)
- P1a blake (owner, UNVERIFIED test_request_club) direct INSERT, both files applied -> 42501 permission denied for table events. PASS
- File 1 only (file 2 undone inside the txn = the pre-deploy window):
  - P1b blake, unverified club -> 42501 RLS (blake passes can_publish_now/consent/owner role, so the verified clause did it). PASS
  - P1c avery, verified club, future start -> ALLOWED (the old route's cookie-client insert keeps working before deploy). PASS
  - P1d avery back-dated 1h -> 42501 RLS. PASS   P1e avery ending 2099 -> 23514 events_max_duration. PASS
  - P1f avery org-less -> 42501 RLS. PASS
- Service role: P5a 121-char title -> 23514 events_title_length. PASS; P5b past event (seed shape) -> ALLOWED (seed safe). PASS;
  P5c 14 days + 1s -> 23514 events_max_duration. PASS
- P2 emery demoted to member (as postgres), blake RSVP'd to emery's Welcome Mixer: as emery can_manage_event f, sees 0 rsvps,
  DELETE 0 rows, UPDATE org_id=null -> 42501, UPDATE starts_at -> 42501. PASS
- P3 avery (owner, not creator): can_manage t, sees 1 rsvp, UPDATE starts_at (back-date) -> 42501, DELETE emery's event 1 row,
  its rsvps cascade to 0. P3f current admin emery deletes avery's event: 1 row. P3g suspended owner avery: DELETE 0 rows. PASS
- P4 hidden-club event made by emery (not a member): blake direct RSVP -> 42501; blake UPSERT (route shape) -> 42501;
  blake sees 0; blake upsert on a visible club event still ALLOWED; emery (creator, not member) sees 0, can_manage f;
  avery (member) RSVP ALLOWED (DB looser than the route's 404, by design), sees + manages. PASS
- P6 delete test_open_club (as postgres): its event and blake's RSVP gone (1,1 -> 0,0). PASS
- P7 anon SELECT events -> 42501 (unchanged). PASS
- BASELINE (both ROLLBACKs run inside one rolled-back txn = today's prod): demoted emery can_manage t; ex-member creator
  sees the hidden-club event; detach org_id=null ALLOWED; non-member hidden-club RSVP ALLOWED; blake unverified-club
  back-dated 2099 insert ALLOWED. So every probe above flips a real hole. Local state after: both files applied.

## Code (done)
- src/app/api/events/route.ts: GET club queries use an id-only `!inner` creator embed (keeps "suspended officer's events drop
  off", product call 8) and ship `creator: null` for club events; org-less byCreator keeps the full embed. Campus org-id list
  adds `.eq("verified", true)`. viewer_can_manage = viewerCanManage (club -> current officer; org-less -> creator).
  POST: rateLimit event-create 10/h after auth; eventTimesProblem (adds 14-day cap, 400 invalid_times); insert with the
  SERVICE client. Caps imported from src/lib/events/manage.ts.
- src/app/api/events/[id]/attendees/route.ts: isUuid -> 400; gate = supabase.rpc("can_manage_event") (same answer as
  rsvps_select_own_or_manager); event read trimmed to `id`.
- rsvp/ics routes: no change (rsvp already 404s hidden clubs; its upsert is covered by the new rsvps_insert_own clause).
- tsc: clean for my files (only error is src/app/api/me/threads/route.ts:181, A2's file mid-edit). node --test manage.test.ts: 6/6.

## Request-level checks (local PostgREST 127.0.0.1:54321, HS256 JWT minted with the local dev secret; dev server :3000)
- dev server: GET /api/events signed out -> 401; GET /api/events/not-a-uuid/attendees -> 400 "Missing event id" (new isUuid path live).
- R1 blake: the route's club query with `creator:users!events_creator_id_fkey!inner(id)` -> 200, creator objects are {id} only.
- R2 blake: org-less query with the full embed + `creator.or=(campus_id.in.(indianapolis))` -> 200 [] (syntax fine).
- R3/R4 rpc can_manage_event: avery (owner) true, emery (admin, creator) true; R5 blake false. (PostgREST exposes the RPC.)
- R6 avery direct POST /events -> 403 42501 permission denied. R7 avery PATCH starts_at -> 403 42501.
- R8 blake reading rsvps of an event he doesn't manage -> 200 [] (own rows only).
- Not done: a full signed-in POST /api/events through Next (needs a browser session; the browser walk after the wave covers it).

## Real Next routes, signed in (SSR cookie built from the local test JWT; dev server :3000 serving the new code)
- N5 avery POST 15-day event -> 400 "An event can last at most 14 days". N6 blake POST on unverified club -> 403 org_unverified.
- N7 avery POST valid event -> 200 (service-role insert works with INSERT revoked from authenticated).
- N8 campus list (Indianapolis) as blake / emery (admin) / avery (owner, creator): creator null for all; viewer_can_manage
  f / t / t; is_creator f / f / t. Open Club Study Night (unverified club) is out of the campus list.
- N9 blake on the unverified open club's own page: its event still listed, creator null.
- N10 emery (current admin, not creator) attendees -> 200; N11 blake -> 403. N3/N4 same on the seed Mixer.
- Probe event deleted afterwards (local). Demoted-creator case not driven over HTTP (would mutate shared org_members while
  other builders probe); covered by psql P2.

## Final state
- Both files applied locally (full ROLLBACK -> re-apply loop run twice, clean). No local schema_migrations rows written.
- npm test: 1128/1129, only the known src/lib/otto/parse-reminder.test.ts failure. manage.test.ts 6/6. tsc clean for A4 files.

## Requests for other batches (not edited by A4)
- A5b (owns src/app/api/orgs/[slug]/route.ts DELETE): add "events (and their RSVPs)" to the DELETE docblock's cascade list;
  events_org_id_fkey is ON DELETE CASCADE after 110000.
- A5a (org_members AFTER DELETE trigger that drops a removed member's RSVPs): it must be SECURITY DEFINER. rsvps_delete_own is
  `auth.uid() = user_id`, so an invoker trigger running under the officer's session deletes 0 rows silently (RLS filters DELETE,
  no error). A4 reviewed: nothing in A4's rsvps policies blocks a definer trigger.
- A2: users SELECT stays unchanged (waveA-build). If it ever gains a block clause, the id-only `!inner` creator join would drop
  club events whose creator blocked the viewer. Tell A4's successor before changing it.
- Follow-up UI batch (already moved out of wave A): officer Delete event button; the DB now lets any current owner/admin delete.

## Deviations from approach-A4 (with reasons)
- Versions: 110000 (before deploy) + 130000 (after), per waveA-build, not 130000/130500.
- Past start: not a CHECK and not a trigger (12/13 live rows past; the seed inserts a past event with the service role).
  It rides on events_insert_authenticated until 130000; afterwards the route (only writer) enforces it.
- Added to 110000 beyond approach: the INSERT policy also requires org_id not null + verified, non-hidden club, so #11's
  main half is closed even before 130000 lands. event_visible creator arm dropped for club events (waveA-build).

## REPAIR 2026-09-28 (reviewer must-fix: rsvps_update_own pivot)
- Reviewer: blake PATCHes his own visible RSVP's event_id to a hidden club's event -> UPDATE 1, then event_visible's RSVP arm
  shows it (calendar, ICS, upcoming, Otto). Accepted: my DOES NOT line left rsvps_update_own alone; that was wrong.
- Local rsvps_update_own right now: USING (auth.uid() = user_id), WITH CHECK ((auth.uid() = user_id) AND (NOT is_restricted_now())
  AND rsvp_on_home_campus(event_id)). authenticated has table-level UPDATE on rsvps. No other wave-A file touches rsvps policies.
- Plan: ALTER POLICY rsvps_update_own WITH CHECK (+ event_org_visible(event_id)), PRE-FLIGHT text check of USING + WITH CHECK,
  no other permissive UPDATE/ALL policy, POST-CHECK regex, ROLLBACK line, header fixed. No column revoke (route upsert SETs event_id).
- Reproduced first (old 110000 applied, BEGIN..ROLLBACK, "Hidden secret meet" made by avery in test_hidden_club): blake
  UPDATE rsvps SET event_id=<hidden> -> UPDATE 1, then SELECT events -> 1 row. Reviewer was right.
- Edited 110000: header §3 (INSERT and UPDATE both gain event_org_visible; why not a column revoke), DOES NOT line (only the
  UPDATE USING and rsvps_delete_own left alone), LIVE STATE (+ rsvps_update_own text, rsvps arwd), ROLLBACK (+ ALTER POLICY
  rsvps_update_own back to the three old clauses), PRE-FLIGHT (USING + WITH CHECK text, no other permissive UPDATE/ALL on
  rsvps), section 3 ALTER POLICY rsvps_update_own WITH CHECK (+ event_org_visible), POST-CHECK (regexes + USING unchanged).
- Loop: file 2 ROLLBACK, file 1 ROLLBACK (both extracted from the headers) -> helper md5 610960856c.../43f184a0e5..., policy
  texts = LIVE STATE, events relacl ard, FK n, only events_check. Re-applied 110000 (PRE-FLIGHT + POST-CHECK pass) and 130000.
  Snapshot diff vs before the repair: only rsvps.rsvps_update_own changed.
- psql probes after (BEGIN..ROLLBACK): F1 pivot -> 42501, blake still sees 0; F1c direct insert 42501; F2 route upsert shape
  (ON CONFLICT DO UPDATE SET event_id,user_id,status) on the visible event OK; F3 status UPDATE 1; F4 avery (hidden-club
  owner) upsert + flip + re-upsert on the hidden event OK; F5 club hidden after blake RSVP'd: status flip 42501 (no app path:
  the PUT route 404s hidden clubs first), DELETE 1 (cancel still works; DELETE route ungated).
- HTTP (local PostgREST 54321, JWT minted with the local secret; probe event created then deleted, RSVP restored):
  H1 PATCH event_id -> 403 42501; H2 GET hidden event -> []; H3 PATCH status -> 204; H4 merge-duplicates upsert -> 200.
- Header LOCAL PROBES gained the 2026-09-28 pivot line. File 2 untouched (its DOES NOT "rsvps" is still true).
- Re-ran: node --test src/lib/events/manage.test.ts 6/6; npx tsc --noEmit 0 errors (whole project); npm test 1129/1130, only
  the known src/lib/otto/parse-reminder.test.ts failure.
- FINAL STATE after repair: both files applied locally (new 110000 + 130000), no schema_migrations rows written, local data
  back to before (4 events, blake's one RSVP going on Open Club Study Night). No code changes this round.
