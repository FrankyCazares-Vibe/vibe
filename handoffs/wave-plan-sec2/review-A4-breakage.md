# Review A4 (club events) — lens: does anything break?

Reviewer started 2026-09-27. Read plan.md, waveA-build.md, approach-A4.md, notes-A4.md.

## Progress log
- Read both migrations, route diffs, manage.ts/test. Prod (MCP read): helper md5s match the PRE-FLIGHT pins
  (can_manage_event 6109..., event_visible 43f1...), only FK into events is rsvps (CASCADE), no triggers,
  authenticated has SELECT on orgs.id/verified/hidden_at (the INSERT policy's exists() works), last mig 20260927142000.
- Other wave migrations: A5a 100000 adds an org_members AFTER DELETE trigger (SECDEF) deleting rsvps; touches no
  events/rsvps policy -> A4 PRE-FLIGHT unaffected. A2 120000 leaves users SELECT/user_visible alone; no events/rsvps.
  A5b 150000 revokes orgs UPDATE columns only. A1 160000 revokes users SELECT on bio/skills/work_experience/current_on
  only; PERSONAL_CREATOR_EMBED reads id,name,handle,avatar_url,school,campus_id -> unaffected.
- Callers of events/rsvps: search, me/calendar(+ics), me/upcoming-events, me/otto (reads only, RSVP arm of event_visible
  unchanged), me/reports (cookie read of id,title,description,creator_id,org_id,starts_at: unchanged), admin/reports
  (service), orgs/[slug] DELETE (service; cascade now removes events+rsvps; no other FK into events). Client: campus-home
  EventCard reads ev.creator?.handle only when org is null; creator_id still shipped (colour fallback).
- RSVP route: 404s every hidden-club event before its cookie-client upsert, so event_org_visible never refuses
  something the route allowed (DB looser for members/admins only). Attendees route: rpc can_manage_event + users
  embed (id,name,handle,avatar_url,major,year) not touched by A1's revoke.
- manage.test.ts 6/6 (node --test). `npx tsc --noEmit -p .` clean (whole tree, 2026-09-27). npm test glob picks up
  untracked src/**/*.test.ts, so the new test runs in the gate.
- DB loop (one BEGIN..ROLLBACK): file-2 ROLLBACK + file-1 ROLLBACK from the headers -> every events/rsvps policy md5
  and both helper md5s EQUAL today's prod (MCP), relacl authenticated=ard, FK n. Re-applying both bodies passes
  PRE-FLIGHT + POST-CHECK. ROLLBACK exact (except function COMMENTs, cosmetic).
- Pre-deploy window (file 2 undone in-txn): emery (admin, private verified club) old-route insert WITH RETURNING
  -> OK; start 7 min ago -> OK (route 5, policy 10). So the old route keeps working between 110000 and the deploy.
- Both applied: blake upsert x2 (insert then ON CONFLICT update) on a visible club event OK; own DELETE OK;
  event_rsvp_counts over all events OK; deleting test_invite_club as service_role cascades its events (A5a trigger
  co-exists) with no error.
- Dev server (:3000 -> local stack via .env.development.local), signed in with a local HS256 cookie, READ-ONLY:
  blake/emery campus list 200 (empty: invite-club events are past, open club unverified -> out of campus list, by
  design); blake org-scoped open club 200 with creator null, creator_id kept, manage f; blake attendees 403;
  emery (current admin + creator) attendees 200. Signed-out GET 401; bad id attendees 400.
- No other caller reads ev.creator for club events (only campus-home :9275, guarded by `ev.org ? ... :`).
  No public/html direct PostgREST use of events/rsvps. No script/test references the renamed/dropped policies.

## Verdict: ship (no must-fix found under the "does anything break?" lens)

## Should-fix (minor)
1. File-1 ROLLBACK leaves A4's COMMENTs on can_manage_event / event_visible (they then describe bodies that are no
   longer there). Add to the ROLLBACK the prod comments read today:
   COMMENT ON FUNCTION public.can_manage_event(uuid) IS 'T1 policy helper for rsvps_select_own_or_manager: true when
   the caller created the event or is owner/admin of its club. Viewer is auth.uid().';
   COMMENT ON FUNCTION public.event_visible(uuid,uuid,uuid) IS 'T1 policy helper for events_select_visible: true when
   the caller created the event, its club is not hidden, the caller is a member of the (hidden) club, or the caller
   has an RSVP on it. Viewer is auth.uid().';
2. File-1 POST-CHECK proves events_delete_manager and events_insert_authenticated by regex only. A cheap behaviour
   probe (as authenticated + claims of a non-officer member, DELETE the club's event inside a savepoint -> 0 rows;
   as a current officer -> 1 row, then roll back the savepoint) would prove the #12 rule where it matters.
3. POST /api/events counts refused attempts (word filter, 14-day, verified) against the 10/hour limit, and the 429
   copy says "Try again shortly" for a window of up to an hour. Same shape as org-create, so a nit; consider
   limiting after validation or copy like "You've made a lot of events this hour. Try again later."
4. The payload still carries creator_id for club events. The UI doesn't use it there, but it is resolvable to a
   person (/api/users/by-id). It is also readable straight from events over PostgREST, so dropping it from the route
   alone gains little; flag for the bypass reviewer / Franky rather than change here.

## Continuation pass (2026-09-28, after usage-limit reset)
- No A4 file changed since this review was written (mtimes all <= 23:38). Verdict stands.
- Re-ran manage.test.ts: 6/6 pass (incl. the caps-equal-CHECKs guard).
- Extra callers checked: events/[id]/ics (cookie read of plain columns + org:orgs(name); only the
  creator arm of event_visible narrows, by design) and search (plain columns + org embed): unaffected.
- event_org_visible -> org_content_visible(NULL) is TRUE, so RSVPs to org-less events still insert.
  org_content_visible is from 20260922140000 (in prod); A2 120000 pins its md5 but doesn't change it,
  A5b 150000 doesn't touch it. can_manage_event keeps arg name p_event_id, EXECUTE to authenticated.
- Old route had the same 120/2000/200 caps and the hidden/verified checks, so the pre-deploy window
  only differs on >14 days (500 instead of 400; 0 cases ever).
- POST uses the service role but still runs requireCanPublish first, so dropping can_publish_now()
  from the insert path takes nothing away.

## Should-fix 5 (pre-existing, product call)
CLUB_CREATOR_EMBED keeps `!inner(id)`. users SELECT is `id = me OR user_visible(id)`, and user_visible
is false while an account restriction is in force, so every club event whose TYPIST is suspended or
banned drops out of the campus and club lists for everyone else. HEAD did the same, so not a
regression, but A4's model is "a club event belongs to the club". Consider no creator embed on the
club queries (they null it anyway) if Franky wants the club's events to stay up.
