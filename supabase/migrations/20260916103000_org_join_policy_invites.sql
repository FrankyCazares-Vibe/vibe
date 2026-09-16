-- Plan 2026-09-15 (handoffs/2026-09-15-indy-campus-onboarding-plan.md §7
-- answers 5-7) and spec handoffs/2026-09-15-org-invites-audience-spec.md §2.6,
-- migration M1c: org join policy, audience, hidden orgs and invites.
--
-- This is the spec's "section 5 append" split out of M1 into its own file
-- (spec critic A3). M1 (20260916100000_campuses_school_system.sql) was APPLIED
-- TO PRODUCTION on 2026-09-15 and recorded in schema_migrations, and wave 1 is
-- live. M1 is immutable now; everything the spec wanted appended to it lives
-- here and is applied separately, after M1 and before wave 2.
--
-- WHAT IT DOES
--   1. public.orgs + join_policy ('open'|'request'|'invite', default 'open'),
--      audience ('both'|'iu'|'purdue', default 'both') and hidden_at
--      (null = visible). join_policy is backfilled from is_public, and the new
--      trigger orgs_sync_join_policy keeps the two in sync for one release so
--      deployed bundles that still send is_public keep working (spec §2.2).
--      No UPDATE grant on any of the three: orgs UPDATE is per-column and the
--      new columns get none, so only the service role writes them (critic D3).
--   2. public.posts_stamp_campus is REDEFINED so posts.school_system is always
--      the AUTHOR's university, and public.orgs.system is then dropped
--      (critic A2). The spec's original edit stamped the post's university
--      from nullif(orgs.audience,'both'); that is wrong, because audience
--      means "who may join", not "which university the post belongs to". A
--      Purdue admin posting as an "IU only" org would have had the post
--      stamped 'iu'. The org's CAMPUS is still taken (under the same A5
--      owner/admin rule), only its university is not.
--   3. Franky's org list (spec §2.6 5b, decision 5): SAE -> invite / both /
--      campus indianapolis; the four test orgs -> hidden_at = now(), NOT
--      deleted, and their handles renamed to 'test-<id8>' so real clubs can
--      take finance-club, cs-club and the rest (critic B5).
--   4. RLS is NARROWED, never widened (critic A4). orgs_select keeps today's
--      "public or member" rule AND adds "not hidden, or member".
--      org_members_select stops exposing hidden orgs' rosters. Self-insert
--      into org_members is dropped and INSERT revoked; org_join_requests
--      writes are revoked (SELECT stays). Every one of those writes already
--      goes through a service-role route — see WHY THIS IS SAFE.
--   5. New table public.org_invites (spec §2.3) with RLS: the invitee, or the
--      org's owner/admin, can read. Nobody but the service role writes.
--   6. public.notifications + org_id (FK, ON DELETE CASCADE) + partial index,
--      and notifications_type_check gains 'org_invite' and
--      'org_request_approved'.
--
-- CHANGES FROM THE SPEC (the "Critic additions" A1-D override §2.6 where they
-- conflict; each is applied here)
--   * A1: the spec's edits were located by stale line numbers, and two of its
--     verify queries would error once orgs.system was gone. This file is new,
--     so there are no line-number edits; the M2 file's orgs.system rows are
--     removed in the same commit as this file.
--   * A2: posts_stamp_campus drops v_org_system entirely instead of switching
--     it to nullif(o.audience,'both'). See item 2 above. M1's A5 owner/admin
--     rule for campus_id, its A6 pg_trigger_depth cascade hatch and its UPDATE
--     pinning are copied through UNCHANGED from the applied body; only the
--     university source changes.
--   * A3: this separate file, applied after M1 and wave 1, is that fix.
--   * A4: orgs_select is NOT widened to "hidden_at is null or member". That
--     would have shown every signed-in user the owner_id, tags, school and
--     updated_at of every private and invite-only org, because authenticated
--     holds table-level SELECT on orgs (live relacl authenticated=rdDxtm) and
--     nothing shows a private org's owner to a non-member today
--     (orgs/[handle]/page.tsx:88-91 selects no owner_id; members/route.ts
--     returns 403). SAE has exactly 1 member, so widening would have named
--     its only member. Narrowing also closes the spec's own "known window":
--     the deployed join route keeps 404ing on SAE instead of filing join
--     requests against an invite-only org.
--
--     >>> CONTRACT FOR WAVE 2b -- B27 MUST RESOLVE THE ORG WITH THE SERVICE
--     >>> CLIENT. Do not delete this paragraph: it is the only place the cost
--     >>> of the A4 decision is written down, and B27 lands in a different
--     >>> batch in a different wave.
--     Spec §4.2 (:529) tells B27 to add
--       org:orgs!notifications_org_id_fkey(handle,name,logo_url)
--     to BOTH notification selects and then to DROP THE ROW when `org` comes
--     back null, on the spec's assumption that "after M1, orgs RLS lets an
--     invitee read SAE's row". A4 makes that assumption FALSE. Both deployed
--     readers use the USER client:
--       me/notifications/route.ts:68-71  supabase.from("notifications").select(FULL_SELECT)
--                                        (`supabase` = createSupabaseServerClient(), :19)
--       me/otto/route.ts:201-204         supabase.from("notifications").select(ACTIVITY_SELECT)
--                                        (`supabase` = createSupabaseServerClient(), :152)
--     After this file SAE is is_public = false, hidden_at = null,
--     join_policy = 'invite', so for a non-member invitee the new qual is
--     (false or false) and (true or false) = FALSE. A PostgREST embed would
--     return org:null, §4.2's null-org rule would delete the row, and EVERY
--     org_invite notification would vanish from Otto and the notifications
--     panel -- the primary and, on the phone, near-only channel by which a
--     student learns they were invited (spec §1). The failure is silent: no
--     error, no empty state, just no invite.
--     SO: embed NOTHING from orgs under the user client in those two routes.
--     Fetch {handle,name,logo_url} for the row's org_id with the SERVICE
--     client and join in TypeScript. Spec critic A4 says the same thing in
--     one line (":874, B27 then resolves ... with the service client"); this
--     is that line, with its reason.
--   * B1: an invite that expires must set resolved_at as well as status, or
--     it violates org_invites_resolved_at_check. Documented on the column.
--     Both table-level CHECKs on org_invites are NAMED, so B23 can map the
--     23514 by constraint name: org_invites_resolved_at_check is a writer bug
--     (500), org_invites_not_self_check is the user's (400 self_invite).
--     Unnamed they would be org_invites_check / org_invites_check1, and that
--     numbering shifts the day anyone adds or drops another table CHECK.
--   * B5: hidden orgs' handles are renamed here (item 3).
--   * C2: org_invites_select admits owner/admin only, not mod. Mods can be
--     added once member removals are recorded (critic A8).
--
-- LIVE STATE BEFORE THIS MIGRATION (read-only catalog SELECTs via the Supabase
-- MCP, 2026-09-15 and RE-RUN UNCHANGED 2026-09-16; re-run them again as
-- PRE-FLIGHT below, because orgs_delete lets an owner delete their own org)
--   * max(version) in supabase_migrations.schema_migrations = 20260916100000
--     (M1 applied). to_regclass('public.org_invites') = NULL.
--     to_regclass('public.campuses') = 'campuses', and it has 'indianapolis'.
--   * orgs: 5 rows, all with campus_id NULL and system NULL. In created_at
--     order (the order every ordered check in this file uses):
--       f7ae4129 finance-club                  is_public=t  verified=t
--       6e881851 private-equity-club           is_public=f  verified=f
--       923896fb sae                           is_public=f  verified=t
--       a73bee3e cs-club                       is_public=f  verified=f
--       6ca4ec6e kelley-floor-university-tower is_public=t  verified=t
--     0 orgs have a handle starting 'test-', so the renames can't collide.
--     orgs.handle has NO format CHECK in the database: its only constraint is
--     UNIQUE (orgs_handle_key). The [a-z0-9][a-z0-9_-]{2,30} shape is enforced
--     by the create route alone (HANDLE_RE, orgs/route.ts:12), and 'test-<id8>'
--     satisfies it. `authenticated` cannot write handle at all (no table-level
--     UPDATE on orgs and no column ACL on handle), so the rename is service-only.
--     Member / pending-request / event / org-post / channel counts:
--       finance-club 2 / 0 / 3 (all past) / 0 / 2
--       private-equity-club 1 / 0 / 0 / 0 / 2
--       sae 1 / 0 / 6 (0 upcoming) / 0 / 4
--       cs-club 1 / 0 / 0 / 0 / 2
--       kelley-floor-university-tower 2 / 0 / 0 / 0 / 2
--     There are 0 pending join requests anywhere and 0 posts with an org_id.
--   * Policies (pg_policies):
--       orgs_select              USING ((is_public = true) OR is_org_member(id, auth.uid()))
--       org_members_select       USING (is_org_member(org_id, auth.uid()) OR EXISTS(orgs o WHERE o.id = org_members.org_id AND o.is_public = true))
--       org_members_insert       WITH CHECK ((user_id = auth.uid()) AND (role = 'member') AND EXISTS(... o.is_public = true))
--       org_join_requests_insert WITH CHECK (user_id = auth.uid())
--       org_join_requests_update USING (org_member_role(org_id, auth.uid()) IN ('owner','admin','mod'))
--       org_join_requests_select USING ((user_id = auth.uid()) OR org_member_role(...) IN ('owner','admin','mod'))
--   * ACLs: orgs authenticated=rdDxtm (table SELECT, no table UPDATE; per-column
--     UPDATE on name, school, description, logo_url, banner_url, tags,
--     is_public, backdrop_preset, updated_at, links, philanthropy — NOT handle,
--     owner_id, verified, campus_id or system). anon has no grant on orgs at all.
--     org_members authenticated=ardDxtm; its ONLY column ACL is
--     role={authenticated=w/postgres} (UPDATE), so there is no column-level
--     INSERT grant and `revoke insert on table` is a real boundary.
--     org_join_requests anon=arwdDxtm AND authenticated=arwdDxtm, no column
--     ACLs. notifications anon+authenticated=arwdDxtm, no column ACLs.
--   * public.is_org_member(uuid,uuid) and public.org_member_role(uuid,uuid) --
--     the two helpers every policy below leans on -- are both LANGUAGE sql,
--     SECURITY DEFINER, STABLE (pg_proc: prosecdef=t, provolatile='s'), so the
--     narrowed policies do not depend on the caller's grants on org_members.
--     Both are EXECUTE-granted to authenticated and NOT to anon (proacl
--     `authenticated=X/postgres`), which is what org_invites_select below
--     needs: a policy expression runs as the querying role.
--   * No table involved here is FORCE RLS (relforcerowsecurity=f on orgs,
--     org_members, org_join_requests, notifications, posts, users), so the
--     owner and the service role bypass every policy -- which is why the
--     negative-test script switches to `authenticated` itself.
--   * pg_depend on the orgs.system column holds exactly two rows, both for
--     the same object: its own CHECK constraint orgs_system_check (deptype a
--     and n). DROP COLUMN removes it, and nothing else depends on the column.
--   * notifications_type_check = CHECK (type IN ('follow','connection','like',
--     'comment','mention')); live rows use only comment, follow, like, mention;
--     notifications has no org_id column; no publication contains orgs,
--     org_members, org_join_requests or notifications.
--   * orgs.system: the only database object that reads it is
--     public.posts_stamp_campus. No view, no other function, no publication
--     (pg_depend on that column holds only its own CHECK constraint, which
--     DROP COLUMN removes). No function in public writes org_members or
--     org_join_requests.
--   * orgs has RLS enabled and NOT forced (relrowsecurity=t,
--     relforcerowsecurity=f), so the owner and the service role bypass it.
--   * users: school_system 'iu' 14, NULL 4.
--
-- RUNS ONCE. Not idempotent: ADD COLUMN / CREATE TABLE / CREATE TRIGGER
-- without IF NOT EXISTS, plus one-time backfills and a DO block that raises on
-- an unexpected row count. A second run fails on the first statement and the
-- whole BEGIN/COMMIT rolls back, changing nothing. Unlike the spec's version
-- of 5b, a raise here aborts ONLY M1c: M1 is already committed and recorded.
--
-- DEPLOY ORDER (spec critic D, "M1 -> wave 1 push -> M1c -> wave 2 + 2b -> M2"),
-- only with Franky's go-ahead:
--   1. M1 applied 2026-09-15: DONE and recorded.
--   2. Wave 1 pushed and live: DONE.
--   3. THIS FILE, with the PRE-FLIGHT and POST-APPLY checks below.
--   4. Wave 2 + wave 2b (the routes that read join_policy / audience /
--      hidden_at and write org_invites).
--   5. M2 (20260916110000_revoke_campus_label_writes.sql), which also revokes
--      UPDATE (is_public) now that wave 2's PATCH writes join_policy with the
--      service role.
--   6. Wave 3, then feature-sentinel and security-sentinel.
--
-- WHY THIS IS SAFE WITH THE CODE DEPLOYED TODAY (every path first read
-- 2026-09-15; every file:line below RE-READ LINE BY LINE 2026-09-16 against
-- HEAD 9bad6b9, which is 14 commits and all of wave 1 later than the original
-- 917775f stamp. All of them still resolve exactly. NOTE FOR RE-CHECKERS: a
-- citation anchors on the line that names the CLIENT -- `await supabase` /
-- `await service` -- not on the `.from("orgs")` line under it, so a reviewer
-- who anchors on .from() will read every one of these as one line short. They
-- are not.)
--   * New columns are nullable or have defaults, and orgs has 5 rows, so the
--     ACCESS EXCLUSIVE lock is held for milliseconds (lock_timeout 5s bounds
--     the wait to acquire it).
--   * POST /api/orgs/[slug]/join loads the org with the USER client
--     (join/route.ts:36-40, select "id, is_public") and 404s when it comes
--     back empty (:45-47).
--       - SAE is private today, so a non-member already gets 404. Narrowing
--         keeps that exactly. Nothing about the invite-only switch makes the
--         old route file a join request on SAE.
--       - The four hidden orgs stop being visible to non-members, so a
--         stranger now gets 404 instead of joining finance-club or
--         kelley-floor-university-tower (both public today). That is the
--         intent of hiding them, and their existing members are unaffected
--         because is_org_member() short-circuits both halves of the policy.
--       - The branch at :62 still reads org.is_public. The sync trigger keeps
--         is_public = (join_policy = 'open'), so no deployed branch changes
--         meaning: the two hidden public orgs stay 'open', the two hidden
--         private ones and SAE stay non-public.
--   * Every org_members INSERT in the app uses the SERVICE client, so
--     revoking INSERT from authenticated breaks nothing:
--       orgs/route.ts:391            service.from("org_members").insert(...)
--       [slug]/join/route.ts:63      service.from("org_members").insert(...)
--       [slug]/requests/[id]/route.ts:88  service.from("org_members").insert(...)
--     Those are the only three inserts in src (grep), and no database function
--     or trigger writes the table. Self-leave still works: it is a DELETE
--     (join/route.ts:159-163) under the untouched org_members_delete policy
--     and the untouched DELETE grant. Role changes still work and never needed
--     the grant at all: members/[userId]/route.ts:98-100 writes with
--     guard.service, the SERVICE client built in requireStaff (:12, :30). The
--     column ACL role={authenticated=w/postgres} (the ONLY column ACL on
--     org_members, live) is therefore unused by the app and is left alone here.
--   * Every org_join_requests WRITE uses the SERVICE client:
--       [slug]/join/route.ts:116-124          service ... .insert(...)  (service built at :49)
--       [slug]/requests/[id]/route.ts:103-110 service ... .update(...)  (service built at :40)
--     Those are the only two writes in src (grep), and no database function or
--     trigger writes the table.
--     SELECT is KEPT because ONE deployed reader uses the USER client:
--       orgs/route.ts:142-147   (discover's "Requested" state; `supabase` is
--                                built at :51 and the service client only
--                                afterwards at :149)
--     Every other reader is already on the service client and would be
--     unaffected either way -- re-read 2026-09-15, because an earlier draft of
--     this header wrongly counted two of them as user-client reads:
--       orgs/[slug]/route.ts:92          service (built at :83)
--       orgs/[handle]/page.tsx:148       service (built at :85)
--       [slug]/join/route.ts:105-111     service
--       [slug]/requests/route.ts:42      service
--       [slug]/requests/[id]/route.ts:62 service
--       [slug]/profile/route.ts:57       service
--     One user-client reader is reason enough to keep the grant; revoking
--     SELECT would break Discover's "Requested" pill for everyone.
--   * Revoking ALL from `anon` on org_join_requests costs nothing: no browser
--     code talks to PostgREST directly. `rg -n "from\(['\"](orgs|org_members|
--     org_join_requests|notifications)['\"]\)" public/html` and the matching
--     rest/v1 grep both return zero hits, so every read of these tables goes
--     through a Next.js route holding a signed-in (authenticated) session.
--   * The narrowed org_members_select does NOT change what a viewer sees of
--     their OWN memberships: orgs/route.ts:131-134 reads org_members with the
--     USER client to build the discover role map, and is_org_member(org_id,
--     auth.uid()) short-circuits the policy true for every one of the viewer's
--     own rows -- including rows in the four hidden orgs. Discover's member
--     COUNT embed is a service-client read (orgs/route.ts:149-160), unaffected.
--   * notifications: a nullable column plus a widened CHECK. Every live row
--     satisfies the new CHECK. Deployed readers select explicit column lists,
--     so the new column is invisible to them: me/notifications/route.ts:42-51
--     (FULL_SELECT / FALLBACK_SELECT) and me/otto/route.ts:196-200
--     (ACTIVITY_SELECT). notifications_insert_as_actor stays mention-only, so
--     the new types are service-role-only in practice.
--     Safe TODAY precisely because neither select embeds orgs. When B27 adds
--     that embed in wave 2b it must use the SERVICE client -- see the A4
--     contract paragraph above, or org_invite rows disappear silently.
--   * Dropping orgs.system: nothing in src or public/html reads it (grep for
--     org.system / orgs.system returns only unrelated hits -- campus-scope's
--     { kind: "system" } and a reserved-handle list). The one database reader
--     is posts_stamp_campus, redefined above the DROP in this same
--     transaction. 0 posts have an org_id, so no existing row's stamp depends
--     on it either.
--   * KNOWN, ACCEPTED WINDOWS until wave 2 / 2b ship (all read-only leakage of
--     test orgs, no student data, no writes). Line numbers re-read at HEAD
--     9bad6b9, the live wave-1 tree:
--       - Discover still lists hidden orgs: orgs/route.ts:149-160 reads with
--         the SERVICE client, which bypasses RLS. B8 adds .is("hidden_at", null).
--       - Search still returns hidden orgs: search/route.ts:202-203 (org search)
--         and :145-146 (the campus org-id list) are both on the service client
--         built at :103. B10 adds the filter.
--       - The campus map (campus-map/route.ts:206-211, USER client built at :69)
--         never showed the four hidden orgs and still doesn't: it filters
--         .in("campus_id", campusIds) and all four keep campus_id NULL.
--         SAE does gain campus_id = 'indianapolis' here, so it enters that
--         filter -- but orgs_select is NARROWED, not widened, and SAE stays
--         is_public = false, so only its one member sees it on the map.
--         Making invite-only orgs visible in lists (§7 Q1's answer) is wave
--         2's job through service-role reads (B10), NOT a job for RLS.
--       - Events embed org:orgs(...) with the USER client
--         (events/route.ts:116-124, search/route.ts:162-168), so a hidden org's
--         embed would come back null (critic A5). NOT reachable today: both
--         queries filter ends_at >= now(), Finance Club's 3 events are all
--         past, and the other three hidden orgs have 0 events. SAE's 6 events
--         are all past too.
--       - An officer of a hidden org can still create events and org posts
--         until wave 2b adds the 409s. All four hidden orgs' members are test
--         accounts.
--       - GET /api/orgs/[slug] (user client, [slug]/route.ts:66-67),
--         GET /api/orgs/[slug]/members (members/route.ts:23-27),
--         the channel routes (channels/route.ts:29,89,
--         channels/subscribe-public/route.ts:34) and campus-map/zone
--         (zone/route.ts:119) all load the org with the USER client, so they
--         now 404 for NON-members of a hidden org. That is the point of
--         hiding, and it is only a change for the two hidden orgs that are
--         public today (finance-club, kelley-floor-university-tower); the two
--         private ones already 404ed. Members are unaffected everywhere,
--         because is_org_member(...) short-circuits BOTH halves of the new
--         policy. Platform admins keep full sight: /admin and
--         /api/admin/orgs read with the SERVICE client (admin/page.tsx:33,
--         api/admin/orgs/route.ts:32).
--   * PostgREST picks up the new table and columns by itself (pgrst_ddl_watch).
--
-- HOW TO APPLY BY HAND. The Supabase MCP execute_sql is read-only, and
-- `supabase db push` needs the DB password, which is not on this machine.
--   0. PRE-FLIGHT (read-only; the MCP execute_sql is fine). Stop if any of
--      these differs in a way you can't explain:
--        SELECT (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest,   -- 20260916100000
--               to_regclass('public.org_invites')  AS invites,                                -- NULL
--               to_regclass('public.campuses')     AS campuses,                               -- campuses
--               (SELECT count(*) FROM public.campuses WHERE id = 'indianapolis') AS indy,     -- 1
--               (SELECT count(*) FROM public.orgs) AS orgs,                                   -- 5
--               (SELECT count(*) FROM public.orgs WHERE handle LIKE 'test-%') AS test_handles,-- 0
--               (SELECT count(*) FROM public.orgs WHERE system IS NOT NULL) AS org_systems,   -- 0
--               (SELECT count(*) FROM public.posts WHERE org_id IS NOT NULL) AS org_posts;    -- 0
--        -- The five prefixes must all still exist. orgs_delete lets an owner
--        -- delete their own org, so re-check this immediately before applying:
--        SELECT left(id::text, 8) AS id8, handle, is_public FROM public.orgs
--         ORDER BY created_at;
--        -- expect exactly these 5, in this order (re-run read-only 2026-09-15):
--        --   f7ae4129 finance-club                  t
--        --   6e881851 private-equity-club           f
--        --   923896fb sae                           f
--        --   a73bee3e cs-club                       f
--        --   6ca4ec6e kelley-floor-university-tower t
--        SELECT pg_get_constraintdef(oid) FROM pg_constraint
--         WHERE conrelid = 'public.notifications'::regclass
--           AND conname = 'notifications_type_check';
--        -- expect CHECK ((type = ANY (ARRAY['follow','connection','like','comment','mention'])))
--        SELECT policyname, qual, with_check FROM pg_policies
--         WHERE schemaname = 'public'
--           AND tablename IN ('orgs','org_members','org_join_requests')
--         ORDER BY tablename, policyname;
--        -- must match LIVE STATE above; this file DROPs by name and the
--        -- ROLLBACK restores these exact texts
--        SELECT has_table_privilege('authenticated','public.org_members','INSERT'),      -- t
--               has_table_privilege('authenticated','public.org_join_requests','INSERT'),-- t
--               has_table_privilege('anon','public.org_join_requests','SELECT');         -- t
--   1. From the repo root, with SUPABASE_ACCESS_TOKEN exported from
--      .env.local (the project ref is in supabase/.temp/project-ref). Use
--      curl, not Python: urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260916103000_org_join_policy_invites.sql '{query:$q}')"
--      A JSON error means nothing was applied (single transaction). `[]` means
--      success. "canceling statement due to lock timeout" means a long reader
--      held a lock: nothing changed, retry in a minute.
--   2. Record it so `db push` stays in sync. Send the same way: save to a
--      scratch .sql file and point --rawfile at it. No statements array,
--      because this file contains dollar-quoted function bodies:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260916103000', 'org_join_policy_invites');
--   3. POST-APPLY VERIFY (read-only; spec §2.7, adjusted: no orgs.system row,
--      the trigger list gains orgs_sync_join_policy, and posts_stamp_campus
--      must no longer mention orgs.system). Use pg_catalog and
--      has_*_privilege, not information_schema: the MCP role
--      (supabase_read_only_user) sees 0 rows in
--      information_schema.column_privileges for these tables.
--      a. SELECT join_policy, audience, count(*), count(hidden_at) AS hidden,
--                count(campus_id) AS campus
--           FROM public.orgs GROUP BY 1,2 ORDER BY 1;
--         -- expect: invite  both 1 0 1
--         --         open    both 2 2 0
--         --         request both 2 2 0
--      b. SELECT count(*) FROM public.orgs WHERE is_public <> (join_policy = 'open');
--         -- expect 0
--      c. SELECT left(id::text,8) AS id8, handle, join_policy, audience,
--                campus_id, (hidden_at IS NOT NULL) AS hidden
--           FROM public.orgs ORDER BY created_at;
--         -- expect, in created_at order:
--         --   f7ae4129 test-f7ae4129 open    both NULL         t
--         --   6e881851 test-6e881851 request both NULL         t
--         --   923896fb sae           invite  both indianapolis f
--         --   a73bee3e test-a73bee3e request both NULL         t
--         --   6ca4ec6e test-6ca4ec6e open    both NULL         t
--      d. SELECT policyname, cmd, qual, with_check FROM pg_policies
--           WHERE schemaname = 'public'
--             AND tablename IN ('orgs','org_members','org_join_requests','org_invites')
--           ORDER BY tablename, policyname;
--         -- expect orgs_select's qual to mention hidden_at; NO org_members_insert;
--         --   org_members_select's qual to name is_public AND join_policy AND
--         --     hidden_at (all three: see the comment on the policy -- it must
--         --     fail closed if the is_public/join_policy mirror is ever broken);
--         --   org_join_requests has ONLY org_join_requests_select;
--         --   org_invites_select exists and names owner/admin only
--      d2. SELECT conname FROM pg_constraint
--            WHERE conrelid = 'public.org_invites'::regclass AND contype = 'c'
--            ORDER BY 1;
--         -- expect org_invites_not_self_check, org_invites_resolved_at_check
--         --   and org_invites_status_check (the inline column CHECK).
--         --   NO org_invites_check / org_invites_check1: the two table-level
--         --   CHECKs are named so B23 can map 23514 -> 500 (writer forgot
--         --   resolved_at) vs 400 self_invite without positional guessing.
--      e. SELECT has_table_privilege('authenticated','public.org_members','INSERT'),      -- f
--                has_table_privilege('authenticated','public.org_members','DELETE'),      -- t (self-leave)
--                has_table_privilege('authenticated','public.org_join_requests','INSERT'),-- f
--                has_table_privilege('authenticated','public.org_join_requests','UPDATE'),-- f
--                has_table_privilege('authenticated','public.org_join_requests','SELECT'),-- t
--                has_table_privilege('anon','public.org_join_requests','SELECT'),         -- f
--                has_table_privilege('authenticated','public.org_invites','SELECT'),      -- t
--                has_table_privilege('authenticated','public.org_invites','INSERT'),      -- f
--                has_table_privilege('authenticated','public.org_invites','UPDATE'),      -- f
--                has_table_privilege('anon','public.org_invites','SELECT');               -- f
--      f. SELECT has_column_privilege('authenticated','public.orgs','join_policy','UPDATE'), -- f
--                has_column_privilege('authenticated','public.orgs','audience','UPDATE'),    -- f
--                has_column_privilege('authenticated','public.orgs','hidden_at','UPDATE'),   -- f
--                has_column_privilege('authenticated','public.orgs','join_policy','SELECT'), -- t
--                has_column_privilege('authenticated','public.orgs','is_public','UPDATE');   -- t (until M2)
--         -- NOTE: do NOT add an orgs.system row here. The column is gone, and
--         -- has_column_privilege on a missing column raises instead of
--         -- returning f, which would fail the whole query (critic A1).
--      g. SELECT pg_get_constraintdef(oid) FROM pg_constraint
--           WHERE conrelid = 'public.notifications'::regclass
--             AND conname = 'notifications_type_check';
--         -- expect the list to include org_invite and org_request_approved
--         SELECT count(*) FROM pg_attribute
--          WHERE attrelid = 'public.notifications'::regclass
--            AND attname = 'org_id' AND NOT attisdropped;              -- 1
--      h. SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
--           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--          WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
--            AND c.relname IN ('users','posts','orgs','campuses','org_invites')
--          ORDER BY 1, 2;
--         -- expect exactly 4 rows, all tgenabled = O (M1's step f had 3):
--         --   orgs  | orgs_sync_join_policy      | BEFORE INSERT OR UPDATE OF is_public, join_policy ...
--         --   posts | bump_org_activity_on_post  | AFTER INSERT ...
--         --   posts | posts_stamp_campus         | BEFORE INSERT OR UPDATE ...
--         --   users | users_campus_in_system     | BEFORE INSERT OR UPDATE OF campus_id, school_system ...
--      i. SELECT prosecdef,
--                pg_get_functiondef(oid) ~* '(o|orgs)\.system'   AS reads_org_system,  -- f
--                pg_get_functiondef(oid) ~  'org_member_role'    AS a5_officer_rule,   -- t
--                pg_get_functiondef(oid) ~  'pg_trigger_depth'   AS a6_cascade_hatch,  -- t
--                pg_get_functiondef(oid) ~  'v_org_system'       AS leftover           -- f
--           FROM pg_proc
--          WHERE pronamespace = 'public'::regnamespace
--            AND proname = 'posts_stamp_campus';
--         -- expect t f t t f
--         SELECT count(*) FROM pg_attribute
--          WHERE attrelid = 'public.orgs'::regclass
--            AND attname = 'system' AND NOT attisdropped;             -- 0
--      j. SELECT max(version) FROM supabase_migrations.schema_migrations;
--         -- expect 20260916103000
--   4. Live smoke (old code, wave 2 not yet shipped): open /orgs/sae as a
--      non-member -- still 404/not available, exactly as before. Open a hidden
--      test org as one of its members -- still loads. Publish a post from the
--      phone and confirm its campus_id / school_system still match your own
--      row (the redefined trigger only changed the ORG university source, and
--      0 posts have an org_id).
--   5. Negative tests: run m1c-tests/negative-tests.sql from the session
--      scratchpad on a Supabase BRANCH or local stack. NEVER on prod.
--
-- ROLLBACK (restores today's policies, grants, column and function verbatim).
-- Roll back wave 2 / 2b code first if it is live: it reads join_policy,
-- audience and hidden_at and writes org_invites. This loses every invite row
-- and un-hides the four test orgs.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   -- 1. invites, notifications
--   DROP TABLE IF EXISTS public.org_invites;
--   DELETE FROM public.notifications WHERE type IN ('org_invite','org_request_approved');
--   ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
--   ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
--     CHECK (type IN ('follow','connection','like','comment','mention'));
--   ALTER TABLE public.notifications DROP COLUMN IF EXISTS org_id;   -- drops idx_notifications_org
--   -- 2. policies and grants, verbatim from their source migrations
--   --    (20260903100000_security_hardening.sql:99-120 and
--   --     20260507110000_org_channels_helpers_rls.sql:60-66,131-149)
--   DROP POLICY IF EXISTS orgs_select ON public.orgs;
--   CREATE POLICY orgs_select ON public.orgs
--     FOR SELECT TO authenticated
--     USING (
--       is_public = true
--       OR public.is_org_member(id, auth.uid())
--     );
--   DROP POLICY IF EXISTS org_members_select ON public.org_members;
--   CREATE POLICY org_members_select ON public.org_members
--     FOR SELECT TO authenticated
--     USING (
--       public.is_org_member(org_id, auth.uid())
--       OR EXISTS (
--         SELECT 1 FROM public.orgs o
--         WHERE o.id = org_members.org_id AND o.is_public = true
--       )
--     );
--   CREATE POLICY org_members_insert ON public.org_members
--     FOR INSERT TO authenticated
--     WITH CHECK (
--       user_id = auth.uid()
--       AND role = 'member'
--       AND EXISTS (
--         SELECT 1 FROM public.orgs o
--         WHERE o.id = org_members.org_id AND o.is_public = true
--       )
--     );
--   CREATE POLICY org_join_requests_insert ON public.org_join_requests
--     FOR INSERT TO authenticated
--     WITH CHECK (user_id = auth.uid());
--   CREATE POLICY org_join_requests_update ON public.org_join_requests
--     FOR UPDATE TO authenticated
--     USING (
--       public.org_member_role(org_id, auth.uid()) IN ('owner','admin','mod')
--     );
--   GRANT INSERT ON TABLE public.org_members TO authenticated;
--   GRANT ALL ON TABLE public.org_join_requests TO anon, authenticated;  -- both were arwdDxtm
--   -- 3. orgs.system back (nullable, same CHECK, same comment), then the
--   --    applied M1 function body. Logic is byte-for-byte what
--   --    pg_get_functiondef returns on prod today (checked 2026-09-15); only
--   --    M1's inline critic comments are elided for length. If you want them
--   --    back too, copy 20260916100000_campuses_school_system.sql:526-583.
--   ALTER TABLE public.orgs ADD COLUMN system text CHECK (system IN ('iu','purdue'));
--   COMMENT ON COLUMN public.orgs.system IS
--     'Registry the org is registered with: iu, purdue, or null for neither. Service role writes only.';
--   CREATE OR REPLACE FUNCTION public.posts_stamp_campus() RETURNS trigger
--   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
--   declare
--     v_org_campus  text;
--     v_org_system  text;
--     v_user_campus text;
--     v_user_system text;
--   begin
--     if tg_op = 'UPDATE' then
--       new.school_system := old.school_system;
--       if pg_trigger_depth() > 1
--          and old.campus_id is not null
--          and new.campus_id is distinct from old.campus_id then
--         if not exists (select 1 from public.campuses c where c.id = old.campus_id) then
--           return new;
--         end if;
--       end if;
--       new.campus_id := old.campus_id;
--       return new;
--     end if;
--     if new.org_id is not null
--        and public.org_member_role(new.org_id, new.user_id) in ('owner', 'admin') then
--       select o.campus_id, o.system
--         into v_org_campus, v_org_system
--         from public.orgs o
--        where o.id = new.org_id;
--     end if;
--     select u.campus_id, u.school_system
--       into v_user_campus, v_user_system
--       from public.users u
--      where u.id = new.user_id;
--     if v_org_campus is not null then
--       new.campus_id     := v_org_campus;
--       new.school_system := coalesce(v_org_system, v_user_system);
--     else
--       new.campus_id     := v_user_campus;
--       new.school_system := coalesce(v_user_system, v_org_system);
--     end if;
--     return new;
--   end $fn$;
--   REVOKE ALL ON FUNCTION public.posts_stamp_campus() FROM public, anon;
--   -- 4. handles back, then the sync trigger and the new orgs columns
--   UPDATE public.orgs SET handle = 'finance-club'                  WHERE left(id::text,8) = 'f7ae4129';
--   UPDATE public.orgs SET handle = 'cs-club'                       WHERE left(id::text,8) = 'a73bee3e';
--   UPDATE public.orgs SET handle = 'private-equity-club'           WHERE left(id::text,8) = '6e881851';
--   UPDATE public.orgs SET handle = 'kelley-floor-university-tower' WHERE left(id::text,8) = '6ca4ec6e';
--   DROP TRIGGER IF EXISTS orgs_sync_join_policy ON public.orgs;
--   DROP FUNCTION IF EXISTS public.orgs_sync_join_policy();
--   ALTER TABLE public.orgs DROP COLUMN IF EXISTS hidden_at,
--                           DROP COLUMN IF EXISTS audience,
--                           DROP COLUMN IF EXISTS join_policy;
--   -- SAE's campus_id stays 'indianapolis' (that column is M1's; M1b folded
--   -- into this file). To undo that too:
--   --   UPDATE public.orgs SET campus_id = NULL WHERE left(id::text,8) = '923896fb';
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260916103000';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- Fail fast instead of queueing every orgs/posts/notifications query behind M1c.
set local lock_timeout = '5s';

-- 1. orgs: join policy, audience, hidden ------------------------------------
alter table public.orgs
  add column join_policy text not null default 'open'
             check (join_policy in ('open','request','invite')),
  add column audience    text not null default 'both'
             check (audience in ('both','iu','purdue')),
  add column hidden_at   timestamptz;

comment on column public.orgs.join_policy is
  'open = join instantly, request = officers approve, invite = officers invite. Service role writes only. is_public mirrors (join_policy = ''open'') via trigger orgs_sync_join_policy until the M3 cleanup.';
comment on column public.orgs.audience is
  'Which verified universities may join: both | iu | purdue, compared with users.school_system. Replaces orgs.system (Franky decision 7). A label checked when a student joins, not a boundary: members are never re-checked, and Purdue Indianapolis students verify with @iu.edu (critic A9). Service role writes only.';
comment on column public.orgs.hidden_at is
  'Set by a platform admin: the org leaves every list, search, map, event list and suggestion; members keep direct access. Unrelated to channel_members.hidden_at, which is a per-user thread hide. Service role writes only.';
-- No grant: authenticated already holds table-level SELECT on orgs, and orgs
-- UPDATE is per-column, so these three columns get no UPDATE (critic D3).

-- 1a. backfill join_policy from is_public, BEFORE the trigger exists
update public.orgs
   set join_policy = case when is_public then 'open' else 'request' end;   -- expect 5

-- 1b. keep is_public and join_policy in sync for one release (spec §2.2).
-- Deployed bundles still send is_public on every org settings save
-- (src/app/campus/campus-home.tsx:1428) and on create (:899), and three live
-- policies read it (orgs_select, org_members_select, org_members_insert --
-- the last two are replaced/dropped below, so after this file only the
-- rewritten orgs_select and campus-home's own UI still consult is_public).
--
-- The body is the spec's §2.6 5a verbatim. One note for whoever reads it next:
-- the `when old.join_policy = 'invite' then 'invite'` arm is DEFENSIVE, not a
-- hot path. Reaching it needs new.is_public = false to be DISTINCT from
-- old.is_public while old.join_policy = 'invite' -- i.e. a row with
-- is_public = true AND join_policy = 'invite', which this trigger's own last
-- line forbids. The case that actually happens in production is the harmless
-- one: an old bundle re-sends is_public = false on an already-invite org, the
-- value is unchanged, no arm fires, and the final assignment leaves both
-- columns exactly as they were. Keep the arm anyway -- it is the only thing
-- standing between SAE and a silent demotion to `request` if the invariant is
-- ever broken (a disabled trigger during a restamp, a future backfill).
-- Negative test T6a covers the real path; T6e breaks the invariant on purpose
-- to cover this arm.
create or replace function public.orgs_sync_join_policy() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.join_policy = 'open' and new.is_public = false then
      new.join_policy := 'request';               -- legacy create body {is_public:false}
    end if;
  elsif new.join_policy is distinct from old.join_policy then
    null;                                          -- new code: join_policy wins
  elsif new.is_public is distinct from old.is_public then
    new.join_policy := case                        -- old bundles toggling is_public
      when new.is_public then 'open'
      when old.join_policy = 'invite' then 'invite'  -- a "private" save keeps invite
      else 'request' end;
  end if;
  new.is_public := (new.join_policy = 'open');
  return new;
end $$;
revoke all on function public.orgs_sync_join_policy() from public, anon;

create trigger orgs_sync_join_policy
  before insert or update of is_public, join_policy on public.orgs
  for each row execute function public.orgs_sync_join_policy();

-- 2. posts.school_system is ALWAYS the author's university (critic A2) ------
-- Redefined BEFORE orgs.system is dropped, in the same transaction, so the
-- trigger never references a column that isn't there. Everything else is
-- copied unchanged from the body applied by M1 on 2026-09-15: the A5
-- owner/admin rule for taking the org's CAMPUS, the A6 pg_trigger_depth
-- cascade hatch, and pinning both columns on UPDATE.
create or replace function public.posts_stamp_campus() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_campus  text;
  v_user_campus text;
  v_user_system text;
begin
  if tg_op = 'UPDATE' then
    -- A post's university never moves after insert.
    new.school_system := old.school_system;

    -- Critic A6: renaming campuses.id cascades an UPDATE into posts at
    -- trigger depth 2. Let that through, and only that: a nested UPDATE
    -- whose OLD campus id has vanished from campuses. The FK forbids deleting
    -- a referenced campus, so a vanished id means a rename. Every other
    -- UPDATE, nested or not, keeps the campus it was posted to.
    if pg_trigger_depth() > 1
       and old.campus_id is not null
       and new.campus_id is distinct from old.campus_id then
      if not exists (select 1 from public.campuses c where c.id = old.campus_id) then
        return new;
      end if;
    end if;

    new.campus_id := old.campus_id;
    return new;
  end if;

  -- INSERT. Whatever the client sent is overwritten.
  -- Critic A5 (unchanged): the org counts only if the author is its owner or
  -- admin, the same rule as /api/orgs/[slug]/posts. Plain membership isn't
  -- enough, or joining any open org would let a student post onto that
  -- campus. A non-member gets NULL, and NULL IN (...) is not true.
  if new.org_id is not null
     and public.org_member_role(new.org_id, new.user_id) in ('owner', 'admin') then
    select o.campus_id
      into v_org_campus
      from public.orgs o
     where o.id = new.org_id;
  end if;

  select u.campus_id, u.school_system
    into v_user_campus, v_user_system
    from public.users u
   where u.id = new.user_id;

  -- Critic A2: the university is ALWAYS the author's. An org's audience says
  -- who may join it, not which university its posts belong to, and orgs no
  -- longer carry a `system` column at all. The org still decides the CAMPUS.
  new.campus_id     := coalesce(v_org_campus, v_user_campus);
  new.school_system := v_user_system;
  return new;
end $$;
revoke all on function public.posts_stamp_campus() from public, anon;

-- Nothing else in the database or in src/ reads this column (see header).
-- DROP COLUMN also drops orgs_system_check.
alter table public.orgs drop column system;

-- 3. Franky's org list (spec §2.6 5b, decision 5; folds in M1b) -------------
-- Raises if a prefix doesn't match exactly the expected rows, which aborts
-- ONLY M1c. Handles of hidden orgs are renamed so a real Finance Club or CS
-- Club can take them (critic B5); 'test-<id8>' satisfies the create route's
-- HANDLE_RE (/^[a-z0-9][a-z0-9_-]{2,30}$/, orgs/route.ts:12) and no live
-- handle starts with 'test-'.
do $$
declare n int;
begin
  update public.orgs
     set join_policy = 'invite', audience = 'both', campus_id = 'indianapolis'
   where left(id::text, 8) = '923896fb';                        -- SAE
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'SAE: expected 1 row, got %', n; end if;

  update public.orgs
     set hidden_at = now(),
         handle    = 'test-' || left(id::text, 8)
   where left(id::text, 8) in ('f7ae4129','6ca4ec6e','a73bee3e','6e881851');  -- test orgs
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'test orgs: expected 4 rows, got %', n; end if;
end $$;

-- 4. RLS: narrow, never widen (critic A4) -----------------------------------
-- Today's rule is kept in full ("public, or a member") and the hidden rule is
-- ANDed on top. Widening to "any non-hidden org" would have exposed every
-- private org's owner_id, tags, school and updated_at to every signed-in
-- user, because authenticated holds table-level SELECT on orgs.
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
  for select to authenticated
  using (
    (is_public or public.is_org_member(id, auth.uid()))
    and (hidden_at is null or public.is_org_member(id, auth.uid()))
  );

-- Same result as today for visible orgs (is_public is kept equal to
-- join_policy = 'open' by the trigger); hidden orgs' rosters close.
--
-- Both is_public AND join_policy are named on purpose, even though the trigger
-- makes them equal. A policy is a READ-TIME check and nothing enforces the
-- invariant at read time: if it is ever broken in the is_public = false /
-- join_policy = 'open' direction -- a disabled trigger during a restamp, a
-- future backfill, exactly what negative test T6e simulates for the other
-- column -- then testing join_policy alone would EXPOSE a roster today's
-- policy hides. Requiring both is strictly narrower than either the old rule
-- (o.is_public = true) or join_policy alone, costs nothing while the invariant
-- holds, and fails closed if it ever doesn't.
drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select to authenticated
  using (
    public.is_org_member(org_id, auth.uid())
    or exists (select 1 from public.orgs o
                where o.id = org_members.org_id
                  and o.is_public
                  and o.join_policy = 'open'
                  and o.hidden_at is null)
  );

-- Membership and join requests are written only by service-role routes that
-- check policy, audience, hidden, campus, rate limit and Terms
-- (orgs/route.ts:391; join/route.ts:63,116-124; requests/[id]/route.ts:88,103-110).
-- Without this, a direct PostgREST insert skips every one of those checks.
-- org_members keeps DELETE (self-leave) and UPDATE (role) exactly as today.
drop policy if exists org_members_insert on public.org_members;
revoke insert on table public.org_members from authenticated;

-- SELECT stays: exactly ONE deployed reader uses the user client --
-- orgs/route.ts:142-147, Discover's "Requested" pill (`supabase` built at :51;
-- the service client only afterwards at :149). Every other reader is already
-- on the service client (orgs/[slug]/route.ts:92 via :83, page.tsx:148 via
-- :85, join:105-111, requests:42, requests/[id]:62, profile:57), but one
-- user-client reader is reason enough to keep the grant. Re-verified against
-- the working tree 2026-09-16; see the header for the full list.
drop policy if exists org_join_requests_insert on public.org_join_requests;
drop policy if exists org_join_requests_update on public.org_join_requests;
revoke all on table public.org_join_requests from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.org_join_requests from authenticated;

-- 5. invites ----------------------------------------------------------------
create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id)  on delete cascade,
  invitee_id  uuid not null references public.users(id) on delete cascade,
  invited_by  uuid references public.users(id) on delete set null,
  status      text not null default 'pending'
              check (status in ('pending','accepted','declined','revoked','expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  -- NAMED ON PURPOSE. Both raise 23514, and B23 has to tell them apart to pick
  -- a status code: the first is a WRITER BUG (500, critic B1 -- the writer
  -- forgot resolved_at), the second is the user's own doing (400
  -- self_invite). Unnamed, Postgres would call them org_invites_check and
  -- org_invites_check1, and those positional names would renumber the day
  -- someone adds or drops another table-level CHECK.
  constraint org_invites_resolved_at_check
    check ((status = 'pending') = (resolved_at is null)),
  constraint org_invites_not_self_check
    check (invited_by is null or invited_by <> invitee_id)
);
comment on table public.org_invites is
  'Officer -> student org invites. Service role writes only; the invitee and the org''s owner/admin can read.';
comment on column public.org_invites.expires_at is
  'Expiry is lazy: readers treat (status = ''pending'' AND expires_at < now()) as expired, and writers flip the row before acting. CRITIC B1: that flip must set resolved_at (use expires_at) as well as status, or constraint org_invites_resolved_at_check raises 23514. That is a WRITER bug (500), not the user''s doing; the other table CHECK, org_invites_not_self_check, is the user''s (400 self_invite).';
comment on column public.org_invites.resolved_by is
  'The invitee (accept/decline), the officer (revoke), a platform admin (hide), or null (expiry).';

create unique index org_invites_one_pending
  on public.org_invites (org_id, invitee_id) where status = 'pending';
create index org_invites_invitee_pending
  on public.org_invites (invitee_id) where status = 'pending';
create index org_invites_org_created
  on public.org_invites (org_id, created_at desc);

alter table public.org_invites enable row level security;
-- Supabase default privileges auto-grant arwdDxtm on new public tables to
-- anon and authenticated. Take them all back, then give read only.
revoke all on table public.org_invites from anon, authenticated;
grant select on table public.org_invites to authenticated;

-- CRITIC C2: officers here means owner/admin only in v1, not mod. Mods can be
-- added once member removals are recorded (critic A8), so a mod can't undo an
-- owner's removal by re-inviting.
create policy org_invites_select on public.org_invites
  for select to authenticated
  using (invitee_id = auth.uid()
         or public.org_member_role(org_id, auth.uid()) in ('owner','admin'));

-- 6. notifications: org rows ------------------------------------------------
alter table public.notifications
  add column org_id uuid references public.orgs(id) on delete cascade;
comment on column public.notifications.org_id is
  'The org an org_invite / org_request_approved notification is about. Rows are inserted by the service role with actor_id = the officer and user_id = the student.';
create index idx_notifications_org on public.notifications (org_id) where org_id is not null;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','connection','like','comment','mention',
                  'org_invite','org_request_approved'));

commit;
