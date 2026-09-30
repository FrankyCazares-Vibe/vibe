# Critique result: A4 club events (go-with-changes)

## Recommended approach

The full critique is at /Users/franciscocazares/vibe/handoffs/wave-plan-sec2/critique-A4.md.

1. #11: revoke INSERT; don't use the CHECK/policy path. Revoke INSERT on public.events from authenticated. POST /api/events (src/app/api/events/route.ts:542) then inserts with the service client it already creates at :512. The evidence for this choice:
   (a) The word filter is TypeScript only (checkText, :482-488), so no database rule can enforce it. The policy path would leave the "unfiltered text" half of #11 open.
   (b) This is the only cookie-client insert anywhere in src/** or public/html/**.
   (c) requireCanPublish (src/lib/moderation/access.ts:217) already covers consent, restriction and school_verified. That is the same as has_recorded_consent() AND can_publish_now(), and creator_id comes from user.id on the server, so nothing the policy checked is lost.
   (d) The revoke also closes org-less inserts (the policy allows org_id IS NULL but the route requires an org) and inserts where the client picks id or created_at.
   Keep length CHECKs anyway, because they bind the service role too: char_length(title) between 1 and 120, description <= 2000, location <= 200. JS .length counts UTF-16 units, which is always >= char_length, so anything the route accepts passes and there is no 500 path. Don't try to make "no past start" a CHECK: now() is not immutable and the CHECK would fire again on later updates. With INSERT and UPDATE both revoked, the route is the only writer, so its guard at :498 is enough. Add rateLimit(`event-create:${user.id}`, { limit: 10, windowSec: 3600 }) right after auth, same shape as org-create at src/app/api/orgs/route.ts:640. POST has no limit today.

2. #12: management follows the current officer role.
   (a) Revoke all six UPDATE column grants on events (id, org_id, creator_id, starts_at, ends_at, created_at), not just org_id and creator_id. Nothing updates events: 20260923090000:2753-2758 says so and today's grep confirms it. A starts_at/ends_at UPDATE is itself the "re-time" attack, and it lets any officer back-date an event to pin it to the top of the campus list.
   (b) Then DROP events_update_creator. In the second file, also DROP events_insert_authenticated. Restate both word for word in ROLLBACK. A later re-grant then fails closed instead of bringing back the creator-scoped hole.
   (c) Rewrite can_manage_event(uuid) with CREATE OR REPLACE, keeping the same signature so grants survive, and switch it to `set search_path = ''`. A club event is managed only by its current owner/admin. An org-less event is managed by its creator. The creator arm must never apply to club events.
   (d) Rewrite events_delete_creator; don't just AND a clause onto it: ((org_id IS NULL) AND (auth.uid() = creator_id)) OR ((org_id IS NOT NULL) AND (NOT is_restricted_now()) AND (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner','admin']))). Keep the DELETE grant.
   (e) In src/app/api/events/[id]/attendees/route.ts:53-62, replace the TS check with supabase.rpc("can_manage_event", { p_event_id: id }). The route and rsvps_select_own_or_manager then give one answer. The function already exists live, so this works in either order. Also add isUuid(id), because today a bad id is a 500.
   (f) In route.ts:392, change `viewer_can_manage: isCreator || isOrgAdmin` to `row.org_id ? isOrgAdmin : isCreator`. Otherwise a demoted creator keeps a "Manage attendees" button (campus-home.tsx:9389) that now returns 403.

3. RSVP to a hidden club's event (Low). Add a new SECURITY DEFINER helper public.event_org_visible(p_event_id uuid): stable, search_path '', EXECUTE granted to anon, authenticated and service_role. Its body is `select public.org_content_visible((select e.org_id from public.events e where e.id = p_event_id))`. Then ALTER rsvps_insert_own WITH CHECK to restate `((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id))` word for word, plus `AND public.event_org_visible(event_id)`. Do NOT write the org_id subquery inline in the policy. Under the caller's RLS it returns NULL for a hidden event, and org_content_visible(NULL) returns TRUE, so the gap would stay open. The route's upsert (rsvp/route.ts:170) is INSERT ... ON CONFLICT, and Postgres applies the INSERT WITH CHECK to it, so this one change covers it. Leave rsvps_update_own and rsvps_delete_own alone.

4. The campus list ships creator identity (Low), and this also fixes an existing bug. Remove the `creator:users!events_creator_id_fkey!inner(...)` embed from the org-scoped query and the byOrg query (route.ts:185-186). Keep it only on the org-less byCreator query, which needs creator.campus_id. Return `creator: null` for club events and keep creator_id. users SELECT is `(id = auth.uid()) OR user_visible(id)`, so today the !inner join drops a club's event from every list once the officer who made it is suspended or banned.

5. Tests: put the pure logic in a new src/lib/events/manage.ts with manage.test.ts (node:test): viewerCanManage({orgId, creatorId, viewerId, viewerIsOfficer}) and the creator-nulling shaper. Run the local probes listed in the critique file inside BEGIN ... ROLLBACK:
   - blake's direct insert for the unverified test_request_club
   - demoted emery_admin: sees only own rsvps, deletes 0 rows, UPDATE fails with 42501
   - avery (owner, not the creator) deletes emery's event
   - a non-member's direct RSVP to a test_hidden_club event fails with 42501
   - a service-role insert with a 121-character title fails with 23514

6. Deploy order: split the migration.
   - 20260928130000_club_events_rules.sql can apply in either order: can_manage_event, event_org_visible + rsvps_insert_own, the DELETE policy, the UPDATE revokes + dropping events_update_creator, and the CHECKs.
   - 20260928130500_events_insert_service_only.sql (revoke INSERT + drop events_insert_authenticated) must apply AFTER the code deploy is live. The wave flow is "apply migrations, then push" (plan.md:48). With that flow the old route's cookie-client insert would get 42501, and Create event would return 500 until the deploy lands. The new code works against both the old and the new database.

## Ownership changes

- ADD a new src/lib/events/ (manage.ts plus manage.test.ts for the viewerCanManage rule and the creator-nulling shaper). No other batch owns it.
- ADD a second migration version 20260928130500_events_insert_service_only.sql. It must apply after the deploy; everything else stays in 20260928130000.
- src/app/api/events/[id]/rsvp/route.ts needs no change (it already refuses hidden clubs with 404, and PUT stays on the cookie client). src/app/api/events/[id]/ics/route.ts needs no change for security. Optional nicety: for private clubs, its org:orgs(name) embed under the cookie client shows the organizer as 'Vibe' to non-members.
- No client file changes needed: campus-home.tsx types `creator` as nullable and reads creator.handle only when there is no org (:9275). viewer_can_manage is fixed on the server. OrgEventsSection.tsx and CampusMobile.tsx reuse EventCard.
- Cross-batch, A2: a block clause on users SELECT would make club events vanish from the campus and club lists through the !inner creator embed (route.ts:186). A4's GET change removes that embed for club events, so A4 should land before or together with any A2 users-SELECT change.
- Cross-batch, A5 (owns src/app/api/orgs/[slug]/route.ts DELETE at :689): deleting a club sets its events' org_id to NULL (events_org_id_fkey ON DELETE SET NULL). They become personal events of their creators, and under the org-less arm an ex-officer creator gets the attendee list back. If Franky agrees, change the FK to ON DELETE CASCADE in A4's migration (it is an events constraint), and A5 adds events to that DELETE docblock's cascade list.
- No conflict with A1, A3 or wave B: src/app/api/search/route.ts:179 and me/calendar, me/calendar/ics, me/upcoming-events and me/otto only READ events/rsvps filtered to the caller, and A4 changes neither events SELECT nor the own-row arm of rsvps SELECT.

## Breakage risks

- Applying the INSERT revoke before the code deploy: POST /api/events returns 500 (42501 permission denied) for every officer until the service-role insert is live. Avoid it by splitting the file and applying 130500 only after the deploy is live.
- Revoking only org_id/creator_id UPDATE, as the plan says, leaves starts_at/ends_at UPDATE open to a demoted creator. events_update_creator's USING clause is creator-only, so re-timing still works, and any officer can back-date an event to pin it to the top of the campus list. Avoid it by revoking all six UPDATE columns and dropping the dead policy. No app code updates events.
- Writing the hidden-club RSVP check as an inline subquery (org_content_visible((select org_id from events where id = event_id))): the caller can't see a hidden event, so the subquery returns NULL, org_content_visible(NULL) returns TRUE, and the gap stays open. Avoid it with a SECURITY DEFINER wrapper, event_org_visible(event_id).
- GET /api/events keeps `viewer_can_manage: isCreator || isOrgAdmin` (route.ts:392): a demoted creator sees 'Manage attendees' and the new attendees check answers 403. Avoid it with `row.org_id ? isOrgAdmin : isCreator`.
- Attendees route keeps its own TS rule (route.ts:53): if it still lets the creator in while can_manage_event does not, a demoted creator gets 200 with an empty list, which is misleading rather than a 500. Avoid it by calling the can_manage_event RPC so the route and the policy agree.
- If A2 adds blocks to users SELECT before A4's GET change lands, club events whose creator blocked the viewer silently disappear from the lists. The same thing already happens today for suspended or banned creators. Avoid it by dropping the !inner creator embed from the org and byOrg queries.
- A length CHECK stricter than the route would turn a 400 into a 500. It can't happen with char_length <= the route's caps, because JS .length counts UTF-16 units, which is always >= Postgres char_length. If a duration cap is added, the route and the CHECK must use the same number.
- CREATE OR REPLACE on can_manage_event must keep the exact signature (p_event_id uuid) and the return type. If it changes, rsvps_select_own_or_manager breaks and so do the EXECUTE grants. The POST-CHECK should assert EXECUTE for all three roles and proconfig search_path="".
- Never REVOKE EXECUTE on any helper (standing rule). The plan doesn't need to, and the builder must not 'tidy' can_manage_event by revoking anon.

## Live facts

- events_insert_authenticated (INSERT, authenticated) WITH CHECK: ((auth.uid() = creator_id) AND has_recorded_consent() AND can_publish_now() AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))))
- events_update_creator (UPDATE) USING (auth.uid() = creator_id) WITH CHECK ((auth.uid() = creator_id) AND can_publish_now() AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])))). A demoted admin passes by setting org_id = NULL.
- events_delete_creator (DELETE) USING ((auth.uid() = creator_id) AND ((org_id IS NULL) OR (NOT is_restricted_now())))
- events_select_visible (SELECT) USING event_visible(org_id, creator_id, id). event_visible = not anon AND (creator OR (org not hidden OR member) OR has an RSVP).
- rsvps_insert_own WITH CHECK ((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id)). rsvps_update_own USING (auth.uid() = user_id) with the same WITH CHECK. rsvps_select_own_or_manager USING ((user_id = ( SELECT auth.uid() AS uid)) OR can_manage_event(event_id)). rsvps_delete_own USING (auth.uid() = user_id).
- can_manage_event(p_event_id uuid): SECURITY DEFINER, STABLE, search_path=public; returns true for the creator OR a current org owner/admin. Only rsvps_select_own_or_manager calls it.
- org_content_visible(p_org_id uuid): SECURITY DEFINER, search_path ''. Returns TRUE when p_org_id IS NULL; also true for members and platform admins of a hidden club.
- Grants: events relacl authenticated=ard (table-level INSERT, SELECT, DELETE). Column-level UPDATE for authenticated on id, org_id, creator_id, starts_at, ends_at, created_at only. No table-level w, so column revokes are real. anon has nothing. rsvps: authenticated=arwd table-level.
- All helpers (can_manage_event, event_visible, org_content_visible, org_member_role, rsvp_on_home_campus, can_publish_now, has_recorded_consent, is_restricted_now, event_rsvp_counts) are EXECUTE for anon, authenticated and service_role.
- Constraints: events_check CHECK (ends_at >= starts_at); events_creator_id_fkey ON DELETE CASCADE; events_org_id_fkey ON DELETE SET NULL; rsvps_event_id_fkey ON DELETE CASCADE; rsvps UNIQUE (event_id, user_id). No triggers on events or rsvps.
- Counts (prod): 13 events, 0 org-less, 0 on unverified clubs, 3 on hidden test clubs, 1 upcoming, 0 over the title/description/location caps, 0 untrimmed, 0 with starts_at before created_at, max duration 2h, 0 whose creator is no longer an owner/admin. 7 rsvps, 3 on hidden-club events, 0 by non-members on hidden-club events. Every proposed CHECK validates and no _cleanup.sql is needed.
- users_select_authenticated USING ((id = ( SELECT auth.uid() AS uid)) OR user_visible(id)). This is why the !inner creator embed drops events made by suspended or banned officers.
- The local DB matches prod for all 8 events/rsvps policies and the events relacl. Local fixtures: test_invite_club (verified; avery_owner owner, emery_admin admin), test_request_club (unverified; blake_iu owner), test_open_club (unverified, 1 event), test_hidden_club (hidden, avery owner, 0 events).

## Questions for Franky (ruled in waveA-build.md)

- What's the maximum length of a club event? Today the route caps nothing, so an officer can create an event that starts now and ends in 2099, and it sits at the top of the campus Events tab forever. The longest live event is 2 hours. Recommendation: 14 days, enforced in the route and by a matching database CHECK.
- When a club is deleted, should its events go with it? Today they are kept but detached, and they turn into personal events of whoever created them, which gives a former officer the attendee list back. Recommendation: delete the club's events with the club, the same as its channels, members and invites. 0 events are affected today.
- Should club officers get a 'Delete event' button now? With this batch the database lets any current officer delete the club's events, but there is still no button in the app. The composer comment at campus-home.tsx:9395 notes that 'there is no way to take an event down from the app'. Recommendation: yes, a Delete button (no Edit yet), in a later UI pass rather than A4, because A4 doesn't own the campus screens. Editing events can wait until it has a service-role route with the word filter.

