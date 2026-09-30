# Critique: A4 club events (senior review, read-only)

Scope: #11 (events INSERT), #12 (management follows current officer role), Low rsvps_insert_own hidden-club gap, Low campus list ships creator identity.
Started 2026-09-27. Appending as I go.

## Live policies (prod, read 2026-09-27 via MCP)
- events_insert_authenticated WITH CHECK: `((auth.uid() = creator_id) AND has_recorded_consent() AND can_publish_now() AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))))`
- events_update_creator USING `(auth.uid() = creator_id)` WITH CHECK `((auth.uid() = creator_id) AND can_publish_now() AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))))`
  -> demoted admin passes USING (creator) and passes WITH CHECK by setting org_id = NULL. That is the "detach" attack.
- events_delete_creator USING `((auth.uid() = creator_id) AND ((org_id IS NULL) OR (NOT is_restricted_now())))`
- events_select_visible USING `event_visible(org_id, creator_id, id)`
- rsvps_insert_own WITH CHECK `((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id))`
- rsvps_update_own USING `(auth.uid() = user_id)` WITH CHECK same as insert; rsvps_select_own_or_manager USING `((user_id = ( SELECT auth.uid() AS uid)) OR can_manage_event(event_id))`; rsvps_delete_own `(auth.uid() = user_id)`
- can_manage_event: SECDEF, search_path 'public' (not ''), creator OR current org owner/admin. Creator branch is the #12 hole (attendee list).
- event_visible: creator OR (org not hidden OR member) OR has an RSVP. The RSVP branch is why the hidden-club RSVP gap turns into a read.
- rsvp_on_home_campus: coalesce(..., true); members bypass campus. No hidden check.
- org_content_visible(p_org_id): **returns TRUE for p_org_id NULL**, and for members + platform admins of a hidden club.

## Live grants on events / rsvps (pg_class.relacl + attacl)
- events relacl: `authenticated=ard` (INSERT, SELECT, DELETE at TABLE level). No anon.
- events column UPDATE for authenticated: id, org_id, creator_id, starts_at, ends_at, created_at (title/description/location were revoked in 20260923090000 section 15). No table-level `w`, so column revokes are REAL here (unlike the 0923 trap where UPDATE was table-level).
- 20260923090000:2753-2781 says, in writing: "There is no event edit route in the app at all ... nothing in src/ or public/ UPDATEs events". Re-verified today: grep of src/** and public/html/** finds zero events UPDATE/DELETE callers.
- rsvps relacl: `authenticated=arwd` table-level. No anon.
- INSERT on events is table-level: authenticated can also set `id` and `created_at` on insert.

## Live counts (prod, COUNTS only)
- events: 13 total; 0 org-less; 0 on unverified clubs; 3 on hidden (test) clubs; 1 upcoming; 0 title/description/location over the route caps; 0 untrimmed; 0 with starts_at before created_at-5min; max duration 2h (0 over 14d); 0 whose creator is no longer an owner/admin.
- rsvps: 7 total; 3 on hidden-club events; 0 by non-members on hidden-club events. => every proposed CHECK validates, and no `_cleanup.sql` is needed for A4.
- No triggers on events or rsvps. Constraints: events_check `ends_at >= starts_at`; events_creator_id_fkey ON DELETE CASCADE; **events_org_id_fkey ON DELETE SET NULL**; rsvps FK event_id ON DELETE CASCADE; rsvps_status_check going/maybe/no.
- Only one policy calls can_manage_event: rsvps_select_own_or_manager. event_rsvp_counts uses event_visible, not can_manage_event. All helpers EXECUTE for anon/authenticated/service_role.
- Local DB matches prod for these 8 policies and the events relacl (local schema_migrations max is 20260926100000 though the 0927 rsvp policy is present: applied by psql, not recorded).
- Local fixtures for probes: test_invite_club (verified; avery_owner owner, emery_admin admin; 2 events), test_request_club (UNVERIFIED; blake_iu owner) = the #11 attacker, test_open_club (unverified, 1 event), test_hidden_club (hidden; avery owner).

## Callers (grep src/** + public/html/**)
- events WRITES with the cookie client: exactly one, `src/app/api/events/route.ts:542` (POST insert + `.select()` RETURNING). No UPDATE/DELETE anywhere. scripts/local-seed.mjs writes with the service role (unaffected).
- events READS (cookie client): events/route.ts GET, events/[id]/attendees, events/[id]/ics, `src/app/api/search/route.ts:179` (no creator), me/calendar, me/calendar/ics, me/upcoming-events, me/otto (all `rsvps ... event:events!inner` filtered `.eq("user_id", user.id)`). A4 does not touch events SELECT, and every rsvps reader filters to the caller's own rows, so none of these change.
- public/html/*: zero direct PostgREST calls on events or rsvps.
- Client: `campus-home.tsx:9389` shows "Manage attendees" when `viewer_can_manage`; `:9275-9284` renders `by @{creator.handle}` ONLY when there is no org; `:9150` uses creator_id only as a colour fallback when org is missing.

## Decision: #11 revoke INSERT (not the CHECK/policy path)
- Picked: `revoke insert on table public.events from authenticated` + the route inserts with the service role after its checks.
- Why (evidence): (1) the word filter is TS-only (`checkText`, route.ts:482-488); no DB rule can run it, so the policy path leaves the finding's "unfiltered text" half open. (2) There is exactly ONE cookie-client insert (route.ts:542), and the route already reads org + membership with the service role (route.ts:512-521). (3) `requireCanPublish` (src/lib/moderation/access.ts:217) = consent + restriction + school_verified, i.e. the same gates as `has_recorded_consent() AND can_publish_now()`; creator_id is set from `user.id` server-side. Nothing the policy checked is lost. (4) It also closes the side doors the policy path would not: org-less inserts (policy allows `org_id IS NULL`, route requires an org), and client-chosen `id`/`created_at` (table-level INSERT covers them).
- Also: the past-start guard cannot be a CHECK (now() is not immutable; it would re-fire on any later update of an old row). With INSERT and UPDATE both revoked the route is the only writer, so its guard is enough.
- Keep length CHECKs anyway (they bind the service role too): title 1..120, description <= 2000, location <= 200. JS `.length` counts UTF-16 units >= Postgres `char_length`, so anything the route accepts passes: no 500 path. Pre-flight count is 0.
- Add a rate limit to POST (none today): `rateLimit(\`event-create:${user.id}\`, { limit: 10, windowSec: 3600 })`, same shape as org-create (orgs/route.ts:640). The composer shows `data.error` raw and tooManyRequests sends plain copy, so no client change.
- NEW GAP the plan misses: no max duration. Through the legit route, an event starting now and ending in 2099 sits at the TOP of the campus list forever (list = `ends_at >= now()` ordered by `starts_at` asc). Live max is 2h. Needs a route cap + matching CHECK; number is Franky's (recommend 14 days).

## Decision: #12 management follows the CURRENT officer role
- Revoke ALL six UPDATE column grants (id, org_id, creator_id, starts_at, ends_at, created_at), not only org_id/creator_id. Reason: nothing updates events (0923 migration said so; re-verified), and starts_at/ends_at UPDATE is itself an attack: a demoted creator re-times the event (finding #12 text), and even a current officer can back-date to pin it to the top of the campus list, skipping the route's past-start guard. A future edit route writes with the service role + word filter (0923:2775-2779 already mandates that).
- DROP events_update_creator and events_insert_authenticated once their grants are gone (restate both word for word in ROLLBACK). A re-grant later then fails CLOSED (RLS on, no policy) instead of silently reopening the creator-scoped hole.
- can_manage_event: CREATE OR REPLACE, same signature (grants survive), switch to `set search_path = ''`: club event -> current owner/admin only; org-less event -> creator. The creator arm must NOT apply to club events.
- events_delete_creator: rewrite (not an AND-on): `((org_id IS NULL) AND (auth.uid() = creator_id)) OR ((org_id IS NOT NULL) AND (NOT is_restricted_now()) AND (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner','admin'])))`. Keep the DELETE grant so a later cookie-client delete route needs no migration. Consider renaming to events_delete_manager.
- Attendees route: replace the TS creator/org_members check with `supabase.rpc("can_manage_event", { p_event_id: id })` so the route and rsvps_select_own_or_manager give one answer (function exists live, so this works before and after the migration). Add `isUuid(id)` (today a bad id reaches PostgREST: 22P02 -> 500).
- GET list: `viewer_can_manage: isCreator || isOrgAdmin` (route.ts:392) MUST become `row.org_id ? isOrgAdmin : isCreator`, or a demoted creator keeps a "Manage attendees" button (campus-home.tsx:9389) that now 403s.

## Low: rsvps_insert_own hidden-club gap
- TRAP: do NOT write `org_content_visible((select e.org_id from public.events e where e.id = event_id))` inline. That subquery runs under the caller's RLS; for a hidden club's event a non-member can't see the row, the subquery yields NULL, and `org_content_visible(NULL)` returns TRUE. The gap would stay open while the file reads as closed.
- Do: new SECDEF helper `public.event_org_visible(p_event_id uuid)` (stable, search_path '', EXECUTE to anon/authenticated/service_role) = `select public.org_content_visible((select e.org_id from public.events e where e.id = p_event_id))`; ALTER rsvps_insert_own WITH CHECK restating `((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id))` word for word + `AND public.event_org_visible(event_id)`.
- The upsert in rsvp/route.ts:170 is INSERT ... ON CONFLICT DO UPDATE, and Postgres applies the INSERT WITH CHECK to every proposed row, so this covers the upsert too. Leave rsvps_update_own and rsvps_delete_own alone (spec 3.4: people keep and can cancel their own RSVPs).
- org_content_visible lets members + platform admins of a hidden club through; the route refuses them (404). DB looser than route = no 500. Acceptable; say so in the header.
- Live: 0 non-member RSVPs on hidden-club events -> no cleanup file.

## Low: campus list ships the creator's identity
- Bigger than it looks: the list embeds `creator:users!events_creator_id_fkey!inner(...)` on EVERY branch (route.ts:186). users SELECT live = `(id = auth.uid()) OR user_visible(id)`, so TODAY a club event made by an officer who is later suspended/banned vanishes from every campus and club list (inner join drops it). And if A2 adds a block clause to users SELECT, club events made by anyone who blocked the viewer vanish too.
- Fix: the org-scoped query and the byOrg query select WITHOUT the creator embed; only the org-less byCreator query keeps the `!inner` embed (it needs creator.campus_id to filter). Response: `creator: null` for club events. Keep `creator_id` (client types it `string`, uses it only as a colour fallback; it is also directly readable over PostgREST, so blanking it in the route would be cosmetic).
- Full close (revoke SELECT(creator_id)) is out of scope: SELECT is table-level `r` and three routes read creator_id with the cookie client.

## Order vs the deploy: SPLIT THE MIGRATION
- The wave flow (plan.md:48) is "apply migrations in order -> push". For A4 that order breaks Create event: once INSERT is revoked, the OLD route's cookie-client insert gets 42501 -> 500, until the new code is live.
- `20260928130000_club_events_rules.sql` (either order): can_manage_event rewrite, event_org_visible + rsvps_insert_own, DELETE policy rewrite, UPDATE column revokes + drop events_update_creator, length CHECKs (+ duration CHECK if Franky picks a number). Every piece has no app writer or the route already refuses the same thing.
- `20260928130500_events_insert_service_only.sql` (AFTER the deploy is live): revoke INSERT on events from authenticated + drop events_insert_authenticated. The new code (service-role insert) works against both the old and new database, so code first is always safe.

## Ownership
- Add: new `src/lib/events/` (pure `manage.ts`: viewerCanManage({orgId, creatorId, viewerId, viewerIsOfficer}) + a response shaper that nulls creator for club events, each with a `*.test.ts`). No other batch touches it.
- No change needed in campus-home.tsx / OrgEventsSection.tsx / CampusMobile.tsx (the `creator` field is already nullable in the client type and only read when there is no org).
- Tell A2: a block clause on users SELECT would make club events vanish from the lists via the `!inner` creator embed; A4's GET change removes that embed for club events, so A4 should land first or together.
- Tell A5 (owns orgs/[slug]/route.ts DELETE): deleting a club SET NULLs its events (events_org_id_fkey), turning them into personal events of their creators, so an ex-officer creator regains the attendee list under the org-less arm. Fix belongs in A4's migration (FK -> ON DELETE CASCADE) if Franky agrees; A5 then adds "events" to the DELETE docblock's cascade list.

## Local probes the builder should run (inside BEGIN ... ROLLBACK)
1. blake (owner, unverified test_request_club) direct insert: today 201 -> after 130500 42501.
2. Demote emery_admin to member (as postgres), then as emery: rsvps for an invite-club event emery created -> own rows only; DELETE -> 0 rows; UPDATE org_id -> 42501.
3. As avery (owner, not creator): DELETE emery's event -> 1 row.
4. Insert an event on test_hidden_club as postgres; as a non-member, direct rsvps insert -> 42501; as avery (member) -> allowed (looser than route, by design).
5. Service-role insert with a 121-char title -> 23514.
6. POST-CHECK: no INSERT/UPDATE for authenticated on any events column; DELETE still granted; helper EXECUTE for all three roles; can_manage_event proconfig is search_path="".
