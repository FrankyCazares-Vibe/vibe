# Review A4 (club events) — bypass lens: does it actually close the findings?

Reviewer started 2026-09-27. Read plan.md, waveA-build.md, approach-A4.md, notes-A4.md.
Plan: read both migrations + route code; grep every reader/writer of events/rsvps; probe local DB as authenticated
with real seed users inside BEGIN..ROLLBACK.

## Progress
- Read both migrations, route.ts diff, attendees route, manage.ts, rsvp route head. Grepped every from("events"/"rsvps").
- Local catalog now: events policies = delete_manager, select_visible (file 2 applied: no INSERT policy, relacl authenticated=rd).
  rsvps: authenticated=arwd TABLE-level (UPDATE on every column incl. event_id). rsvps_update_own WITH CHECK =
  ((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id)) -- NO event_org_visible.
  SUSPECT: RSVP to a visible event, then PATCH event_id -> hidden-club event = same Low hole via UPDATE. Probing.
- U1 CONFIRMED (BEGIN..ROLLBACK, as blake_iu authenticated): postgres made a future event on test_hidden_club
  (avery owner). blake: sees it 0 rows; direct INSERT rsvp -> 42501 (new clause works). Then
  `update rsvps set event_id=<hidden event> where user_id=blake and event_id=<Open Club Study Night>` -> UPDATE 1,
  and `select ... from events where id=<hidden>` -> 1 row, title 'Hidden secret meet'. So the Low (non-member RSVPs to a
  hidden club's event, then event_visible's RSVP arm shows it) is still open via rsvps_update_own + table-level UPDATE.
  Fix: restate rsvps_update_own WITH CHECK word for word + `AND public.event_org_visible(event_id)` in 110000
  (+ PRE-FLIGHT text check, POST-CHECK regex, ROLLBACK line). Don't revoke column UPDATE on event_id: the RSVP route's
  upsert (merge-duplicates) SETs every payload column, so a column revoke would 500 it.
- Proposed fix tested in BEGIN..ROLLBACK: ALTER rsvps_update_own WITH CHECK (old text + event_org_visible(event_id)) ->
  F1 blake's event_id pivot to the hidden event 42501; F2 the route's upsert shape (ON CONFLICT DO UPDATE SET
  event_id/user_id/status) on a visible event still OK; F3 a plain status UPDATE still OK. No new 500 path: the RSVP
  route 404s hidden-club events before its upsert.
- #12 re-probed independently (emery demoted inside txn): can_manage f, rsvps 0, UPDATE org_id/ends_at 42501
  (permission denied for table events), DELETE 0; blake DELETE on invite-club events 0; avery (owner) can_manage t,
  sees 1 rsvp, DELETE 1. #11: emery/blake direct INSERT 42501 (file 2). Pre-deploy window (file 2 undone in txn):
  emery (current admin, NOT platform admin) normal insert OK; insert on a hidden club 42501; creator_id=someone else 42501.
- No other writers: grep from("events"/"rsvps") = only route.ts:587 (service), seed (admin); no SQL function writes
  events/rsvps except A5a's org_members_drop_club_access. orgs / org_members have no UPDATE/INSERT grants for
  authenticated locally, so verified/role can't be self-granted. Helpers: search_path '', schema-qualified, stable,
  EXECUTE to all three roles, no REVOKE EXECUTE. Product call 8 not backwards anywhere.
- Local state after all probes: policies md5 f7b10330..., 4 events, 1 rsvp, emery admin, events relacl authenticated=rd.
  manage.test.ts 6/6.

## Verdict: FIX FIRST (one mustFix)

MUST FIX
1. supabase/migrations/20260928110000_club_events_rules.sql, section 3: the hidden-club RSVP Low is only half closed.
   rsvps_update_own keeps WITH CHECK ((auth.uid() = user_id) AND (NOT is_restricted_now()) AND
   rsvp_on_home_campus(event_id)) and authenticated holds TABLE-level UPDATE on rsvps (event_id included). A
   non-member RSVPs to any visible home-campus event, then PATCH /rest/v1/rsvps?id=eq.<own> {"event_id":"<hidden>"};
   event_visible's RSVP arm then serves the hidden event (U1: 1 row back). Fix: in the same file,
   `alter policy rsvps_update_own on public.rsvps with check ((auth.uid() = user_id) and (not public.is_restricted_now())
   and public.rsvp_on_home_campus(event_id) and public.event_org_visible(event_id));` plus a PRE-FLIGHT text check of
   rsvps_update_own (USING and WITH CHECK) and no other permissive UPDATE/ALL policy on rsvps, a POST-CHECK regex, the
   ROLLBACK line restoring the old WITH CHECK, and fix the header's DOES NOT line. Don't use a column revoke instead
   (the route's merge-duplicates upsert SETs event_id/user_id and would 500).

SHOULD FIX (not blocking)
- The same report line (Low, rsvps) also says a direct RSVP skips the Terms gate and rate limit; rsvps_insert_own has no
  has_recorded_consent(). Not in A4's spec row; flag for a follow-up.
- can_manage_event has no is_restricted_now() while events_delete_manager does: a suspended officer can still read a
  club event's attendee list (names, majors, years) over PostgREST. Consider `and not public.is_restricted_now()` in
  the club arm (the attendees route answers 403 then; restricted users are locked out of the app anyway).
- src/app/api/search/route.ts (not A4's) still lists unverified clubs' events; the campus list now doesn't.

## Resumed 2026-09-28 01:52 (after usage-limit pause)
- Files unchanged since the first pass (110000 mtime 23:37, review 23:44). Re-verifying U1 against the current local DB,
  then extra checks: POST service-role insert gates, ics/rsvp/search readers, event_rsvp_counts, helper bodies.
- 01:55 U1 RE-CONFIRMED on the current local DB (BEGIN..ROLLBACK, blake as authenticated): rsvps_update_own WITH CHECK is
  still ((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id)); direct INSERT to the
  hidden event 42501, then UPDATE rsvps SET event_id=<hidden> on his Open Club Study Night row -> UPDATE 1, and the
  hidden event is then readable (1 row, 'Hidden secret meet'). mustFix #1 stands.
- 02:00 Extra checks (all pass): POST /api/events service-role insert runs requireCanPublish (Terms, school email,
  restriction), rate limit 10/h, lengths, checkText on title/description/location, eventTimesProblem (past start,
  14 days), service-role org load (404 hidden, 403 unverified), current owner/admin role, creator_id = user.id.
  events: authenticated has no INSERT/UPDATE on any column (file 2 applied); 4 CHECKs + FK CASCADE present.
  Only readers of events/rsvps outside A4: search (not A4), me/calendar, me/calendar/ics, me/upcoming-events, me/otto
  (cookie client, via rsvps -> events!inner): with U1 the pivoted hidden event also lands in the attacker's calendar,
  ICS and Otto "Heads up", so the one policy fix covers them all. Functions reading events/rsvps: event_visible,
  can_manage_event, event_org_visible (all search_path '', schema-qualified, EXECUTE to anon/authenticated/service_role,
  no REVOKE EXECUTE), event_rsvp_counts (pre-existing, filters by event_visible), rsvp_on_home_campus,
  org_members_drop_club_access (A5a, DELETE only). No new writer.
- Proposed fix re-tested in BEGIN..ROLLBACK on the current DB: F1 pivot -> 42501 and hidden stays unseen; F2 route-shape
  upsert on a visible event OK; F3 plain status UPDATE OK; F4 a hidden club's MEMBER (avery) upsert/status flip on the
  hidden event still OK. Local policy verified back to its pre-probe text afterwards.
- manage.test.ts 6/6; tsc: no errors in src/app/api/events/** or src/lib/events/**.
- Product call 8 checked line by line: 14 days, no past start, verified + non-hidden only, owner/admin (not mod),
  club delete cascades events, suspended officer's events keep dropping off (id-only !inner embed). None backwards.

## Final verdict (unchanged): FIX FIRST — mustFix #1 (rsvps_update_own lacks event_org_visible).
