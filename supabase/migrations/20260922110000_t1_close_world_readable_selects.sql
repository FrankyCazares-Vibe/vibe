-- T1 FILE 2 OF 2 -- close the six world-readable tables (week-1 wave plan,
-- handoffs/wave-plan-week1/T1.md, as amended by handoffs/wave-plan-week1/
-- rulings.md H1, H2, M8, M9, M10).
--
-- WHY. Any signed-in student can today ask the REST endpoint for every like,
-- comment like, repost, follow edge, event and RSVP on Vibe, with who did it
-- and when: the six SELECT policies below are `USING (true)`. This file
-- narrows each table to "your own rows" plus the few extra rows a real screen
-- needs. The counts moved to file 1's RPCs and the lists that show other
-- people moved to server-side reads behind a block check (T1b-T1d), so no
-- screen changes shape. Counts are public, identities are private.
--
-- WHAT IT DOES
--   1. Drops the six *_select_authenticated policies and creates:
--        post_likes      post_likes_select_own            your own rows
--        comment_likes   comment_likes_select_own         your own rows
--        post_reposts    post_reposts_select_own          your own rows
--        connections     connections_select_either_party  edges you are in
--        events          events_select_visible            event_visible(...)
--        rsvps           rsvps_select_own_or_manager      yours, or events you
--                                                         manage
--      events_select_visible: you created it, OR its club is not hidden
--      (private clubs included: rush events are public on purpose), OR you
--      are a member of its (hidden) club, OR you RSVP'd to it.
--      rsvps_select_own_or_manager: your own RSVP, or any RSVP on an event you
--      created or whose club you own/admin (the attendees route's own check,
--      src/app/api/events/[id]/attendees/route.ts:53-65).
--   2. Trims grants on the six tables:
--        anon           everything revoked (no anon policy exists, so anon
--                       reads 0 rows today; every anon caller uses the service
--                       client, e.g. users/[handle]/bootstrap/route.ts:78).
--        authenticated  TRUNCATE, REFERENCES, TRIGGER, MAINTAIN revoked on all
--                       six (no route uses them); UPDATE revoked on post_likes,
--                       comment_likes and connections (no UPDATE policy exists
--                       on those three, so nothing changes). post_reposts,
--                       events and rsvps keep UPDATE: the repost and RSVP
--                       routes upsert, and event edits update.
--   It does NOT touch any INSERT/UPDATE/DELETE policy, post_comments,
--   post_views, bookmarks, orgs_select, org_members_select or
--   org_followers_select.
--
-- WHY THE POLICIES CALL DEFINER HELPERS. orgs_select hides the only real club
-- (is_public = false) from non-members, so a policy that joined orgs under the
-- viewer's RLS would hide its rush events from every non-member. event_visible
-- and can_manage_event (file 1) read as their owner instead.
-- RECURSION. events_select_visible -> event_visible reads rsvps as owner (no
-- RLS), and rsvps_select_own_or_manager -> can_manage_event reads events as
-- owner. Neither policy names the other's table, so Postgres never expands one
-- inside the other.
-- KNOWN GAP, FOLLOW-UP NEEDED (reviewer finding, 2026-09-22; file 1's header
-- has the detail). events_select_visible's RSVP clause can be self-granted: a
-- signed-in student who holds a hidden club's event uuid inserts their own
-- RSVP straight over REST (rsvps_insert_own checks only auth.uid() = user_id;
-- the hidden-club refusal lives only in src/app/api/events/[id]/rsvp/route.ts)
-- and then reads the event. Not a regression: today every event is readable.
-- This file keeps its hands off INSERT policies (T1 Do-not-touch); the fix is
-- a hidden-club check on rsvps_insert_own in its own migration.
--
-- WHY LIKES AND REPOSTS HAVE NO "ROWS ON POSTS YOU OWN" CLAUSE. It would let a
-- free account read who liked their post straight from the REST endpoint,
-- which is the paid "who" line in the product thesis. Owner-facing liker lists
-- belong behind an entitlement-checked route, as me/posts/[id]/viewers already
-- does for views. (Rulings M6: like NOTIFICATIONS name the liker to free
-- accounts, as Instagram does. That is the accepted free exception and this
-- file does not change it.)
--
-- LIVE STATE BEFORE THIS FILE (read-only MCP, production, 2026-09-21)
--   * The six SELECT policies above, all TO authenticated, PERMISSIVE, qual
--     `true`, defined at 20260504130000_post_likes_comments.sql:30-33,
--     20260508120000_comment_likes_and_replies.sql:27-30,
--     20260508100000_post_reposts.sql:30-33 and
--     20260430190000_phase1_initial_schema.sql:306 (connections), :463
--     (events), :480 (rsvps).
--   * relacl on all six: {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--     authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}.
--   * Other policies (unchanged here): post_likes/comment_likes insert_own +
--     delete_own; post_reposts insert_own (+ has_recorded_consent()),
--     update_own, delete_own; connections insert_follower, delete_follower;
--     events insert (creator + consent), update_creator, delete_creator; rsvps
--     insert_own, update_own, delete_own.
--   * None of the six tables is in the supabase_realtime publication, none is
--     FORCE RLS, and no view or `(count)` embed reads them.
--   * Row counts (drift): post_likes 9, comment_likes 0, post_reposts 5,
--     connections 27, events 10, rsvps 6.
--
-- NOT RE-RUNNABLE. CREATE POLICY has no IF NOT EXISTS, so a second run fails on
-- the first CREATE and the whole BEGIN/COMMIT rolls back, changing nothing.
-- The guard at the top of the body refuses to run without file 1's helpers.
--
-- DEPLOY ORDER. THE ORDER IS THE WHOLE GAME (T1 Risk 1).
--   (1) T1 file 1 applied -> (2) T1b-T1d deployed and Vercel shows Ready ->
--   (3) THIS FILE -> (4) the GET-only smoke below.
--   Applied before the T1 code is live, every like, repost and going count
--   reads 0 or 1, and every follow list shows only the viewer: the "tightened
--   a SELECT, screens went quiet" bug.
--   Planned production order for the week-1 migrations (rulings H2):
--     T1 file 1 -> E1 -> P1 -> T1 file 2 (this) -> T2.
--   VERCEL ROLLBACK RULE (rulings M9): while this file is live, never
--   instant-roll Vercel back to a build older than T1b-T1d. Run this file's
--   ROLLBACK first (seconds), then roll Vercel back. Preview deployments that
--   share the production database have the same problem.
--
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes).
--   0. PRE-FLIGHT, read-only (MCP execute_sql). STOP on anything you can't
--      explain.
--      a. The code gate: the Vercel deploy holding T1b-T1d is Ready (gh, as in
--         reference_live_verification).
--      b. The version gate (rulings H2). "My predecessor is present and my
--         own version is absent", NEVER max(version): E1 (20260922104000) and
--         P1 (20260922101100) are planned to land before this file and T2
--         after it, so any of them being present is expected.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260922100000', '20260922110000')
--            ORDER BY 1;
--           -- expect exactly ONE row: 20260922100000.
--           -- Both rows: already applied. STOP.
--           -- No rows: file 1 is missing. STOP (the body guard would refuse
--           --   anyway).
--      c. File 1's helpers are in place:
--           SELECT proname, prosecdef, proacl::text FROM pg_proc
--            WHERE pronamespace = 'public'::regnamespace
--              AND proname IN ('event_visible', 'can_manage_event')
--            ORDER BY 1;
--           -- expect both t, both
--           --   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--      d. The six policies are still the open ones:
--           SELECT tablename, policyname, qual FROM pg_policies
--            WHERE schemaname = 'public' AND cmd = 'SELECT'
--              AND tablename IN ('post_likes','comment_likes','post_reposts',
--                  'connections','events','rsvps')
--            ORDER BY 1;
--           -- expect exactly the six *_select_authenticated rows, qual `true`.
--      e. The grants:
--           SELECT relname, relacl::text FROM pg_class
--            WHERE relnamespace = 'public'::regnamespace
--              AND relname IN ('post_likes','comment_likes','post_reposts',
--                  'connections','events','rsvps')
--            ORDER BY 1;
--           -- expect all six as in LIVE STATE. If T2 was applied first (not
--           -- the plan), post_likes and comment_likes read
--           -- {postgres=arwdDxtm/postgres,authenticated=rm/postgres,
--           --  service_role=arwdDxtm/postgres}; that is fine, this file's
--           -- revokes on them are then no-ops.
--      f. Snapshot the numbers the screens show, ids as left(id::text,8) only,
--         no identities. The smoke compares against this.
--           SELECT left(p.id::text, 8) AS post,
--                  (SELECT count(*) FROM public.post_likes l WHERE l.post_id = p.id) AS likes,
--                  (SELECT count(*) FROM public.post_reposts r WHERE r.post_id = p.id) AS reposts
--             FROM public.posts p ORDER BY p.created_at DESC;
--           SELECT left(e.id::text, 8) AS event,
--                  count(r.id) FILTER (WHERE r.status = 'going') AS going,
--                  count(r.id) FILTER (WHERE r.status = 'maybe') AS maybe
--             FROM public.events e LEFT JOIN public.rsvps r ON r.event_id = e.id
--            GROUP BY e.id ORDER BY 1;
--           SELECT left(u.id::text, 8) AS usr,
--                  (SELECT count(*) FROM public.connections c WHERE c.following_id = u.id) AS followers,
--                  (SELECT count(*) FROM public.connections c WHERE c.follower_id = u.id) AS following
--             FROM public.users u ORDER BY 1;
--   1. Apply with the management-API curl recipe at
--      supabase/migrations/20260916120000_org_followers.sql:443-458, pointing
--      --rawfile at this file. `[]` means success. A JSON error means nothing
--      was applied (one transaction). "canceling statement due to lock
--      timeout": a long reader held a lock; nothing changed, retry in a minute.
--   2. Record it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260922110000', 't1_close_world_readable_selects');
--   3. POST-APPLY, read-only:
--      a. The six new policies, verbatim as pg_policies prints them:
--           SELECT tablename, policyname, roles::text, qual FROM pg_policies
--            WHERE schemaname = 'public' AND cmd = 'SELECT'
--              AND tablename IN ('post_likes','comment_likes','post_reposts',
--                  'connections','events','rsvps')
--            ORDER BY 1;
--           -- comment_likes | comment_likes_select_own        | {authenticated} | (user_id = ( SELECT auth.uid() AS uid))
--           -- connections   | connections_select_either_party | {authenticated} | ((( SELECT auth.uid() AS uid) = follower_id) OR (( SELECT auth.uid() AS uid) = following_id))
--           -- events        | events_select_visible           | {authenticated} | event_visible(org_id, creator_id, id)
--           -- post_likes    | post_likes_select_own           | {authenticated} | (user_id = ( SELECT auth.uid() AS uid))
--           -- post_reposts  | post_reposts_select_own         | {authenticated} | (user_id = ( SELECT auth.uid() AS uid))
--           -- rsvps         | rsvps_select_own_or_manager     | {authenticated} | ((user_id = ( SELECT auth.uid() AS uid)) OR can_manage_event(event_id))
--      b. The grants:
--           SELECT relname, relacl::text FROM pg_class
--            WHERE relnamespace = 'public'::regnamespace
--              AND relname IN ('post_likes','comment_likes','post_reposts',
--                  'connections','events','rsvps')
--            ORDER BY 1;
--           -- comment_likes, connections, post_likes:
--           --   {postgres=arwdDxtm/postgres,authenticated=ard/postgres,service_role=arwdDxtm/postgres}
--           -- events, post_reposts, rsvps:
--           --   {postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}
--           -- (After T2 lands, post_likes and comment_likes read
--           --  authenticated=r/postgres.)
--           SELECT has_table_privilege('anon', 'public.connections', 'SELECT'),        -- f
--                  has_table_privilege('authenticated', 'public.post_likes', 'TRUNCATE'), -- f
--                  has_table_privilege('authenticated', 'public.rsvps', 'UPDATE'),     -- t
--                  has_table_privilege('authenticated', 'public.post_reposts', 'UPDATE'); -- t
--   4. SMOKE, GET-ONLY (rulings M8), run by the orchestrator right after step
--      2. Plain API GETs with Franky's session cookie (curl), NOT page loads:
--      opening the post viewer POSTs a post view and visiting another
--      student's profile page POSTs a profile view, and a production check
--      writes nothing. Every number must match the step 0f snapshot:
--        GET /api/feed?sort=recent&limit=20       like_count / repost_count per card
--        GET /api/posts/<one of Franky's posts>   counts.likes / counts.reposts
--        GET /api/users/<Franky's handle>/followers and /following   total
--        GET /api/events?org_id=<SAE's id>        going_count / interested_count
--        GET /api/me/upcoming-events              the events Franky RSVP'd to
--      And the hole is closed: with Franky's access token,
--        GET /rest/v1/connections?select=follower_id,following_id
--      returns only edges Franky is in, and
--        GET /rest/v1/post_likes?select=post_id,user_id
--      returns only Franky's own likes.
--      A mismatch means a screen went quiet: run the ROLLBACK below at once,
--      then investigate.
--
-- ROLLBACK. Run this FIRST, before file 1's rollback and before any Vercel
-- rollback past T1b-T1d. The T1 code keeps working on the open policies (its
-- RPCs and service reads don't depend on them), so this is safe at any time.
-- Rulings H1: this restores ONLY this file's change. Grants that T2
-- (20260922120000) also revokes are NOT given back, or this rollback would
-- reopen T2's fix for direct like writes. After it, re-run T2's POST-CHECK if T2
-- is applied.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   DROP POLICY IF EXISTS "post_likes_select_own" ON public.post_likes;
--   CREATE POLICY "post_likes_select_authenticated" ON public.post_likes
--     FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS "comment_likes_select_own" ON public.comment_likes;
--   CREATE POLICY "comment_likes_select_authenticated" ON public.comment_likes
--     FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS "post_reposts_select_own" ON public.post_reposts;
--   CREATE POLICY "post_reposts_select_authenticated" ON public.post_reposts
--     FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS "connections_select_either_party" ON public.connections;
--   CREATE POLICY "connections_select_authenticated" ON public.connections
--     FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS "events_select_visible" ON public.events;
--   CREATE POLICY "events_select_authenticated" ON public.events
--     FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS "rsvps_select_own_or_manager" ON public.rsvps;
--   CREATE POLICY "rsvps_select_authenticated" ON public.rsvps
--     FOR SELECT TO authenticated USING (true);
--   -- the four tables T2 does not touch: back to arwdDxtm for anon, and the
--   -- revoked extras for authenticated
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--     ON public.post_reposts, public.connections, public.events, public.rsvps TO anon;
--   GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--     ON public.post_reposts, public.connections, public.events, public.rsvps TO authenticated;
--   GRANT UPDATE ON public.connections TO authenticated;
--   -- post_likes / comment_likes: only MAINTAIN, the one privilege T2 leaves alone
--   GRANT MAINTAIN ON public.post_likes, public.comment_likes TO authenticated;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922110000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- Expected relacl afterwards, with T2 not applied: post_reposts, connections,
-- events and rsvps back to arwdDxtm for anon and authenticated (anon now
-- listed last); post_likes and comment_likes
-- {postgres=arwdDxtm/postgres,authenticated=ardm/postgres,service_role=arwdDxtm/postgres}.
-- Left out on purpose: anon's privileges on post_likes and comment_likes, and
-- authenticated's UPDATE, TRUNCATE, REFERENCES and TRIGGER on them. T2 revokes
-- all of those too. If T2 has NEVER been applied and the exact pre-T1 relacl
-- is wanted, also run
--   GRANT ALL ON public.post_likes, public.comment_likes TO anon;
--   GRANT UPDATE, TRUNCATE, REFERENCES, TRIGGER
--     ON public.post_likes, public.comment_likes TO authenticated;
-- No screen needs either line.
-- ---------------------------------------------------------------------------

begin;

-- ACCESS EXCLUSIVE on six small tables for milliseconds; fail fast rather than
-- queue every read behind a long reader.
set local lock_timeout = '5s';

-- 0. guard: file 1's helpers must exist (the policies below call them) -------
do $$
begin
  if to_regprocedure('public.event_visible(uuid, uuid, uuid)') is null
     or to_regprocedure('public.can_manage_event(uuid)') is null then
    raise exception 'T1 file 2 needs 20260922100000_t1_count_and_visibility_fns applied first';
  end if;
end $$;

-- 1. the six policies --------------------------------------------------------
-- (select auth.uid()) is evaluated once per statement, not once per row.

drop policy if exists "post_likes_select_authenticated" on public.post_likes;
create policy "post_likes_select_own" on public.post_likes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "comment_likes_select_authenticated" on public.comment_likes;
create policy "comment_likes_select_own" on public.comment_likes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "post_reposts_select_authenticated" on public.post_reposts;
create policy "post_reposts_select_own" on public.post_reposts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "connections_select_authenticated" on public.connections;
create policy "connections_select_either_party" on public.connections
  for select to authenticated
  using ((select auth.uid()) = follower_id or (select auth.uid()) = following_id);

drop policy if exists "events_select_authenticated" on public.events;
create policy "events_select_visible" on public.events
  for select to authenticated using (public.event_visible(org_id, creator_id, id));

drop policy if exists "rsvps_select_authenticated" on public.rsvps;
create policy "rsvps_select_own_or_manager" on public.rsvps
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_event(event_id));

-- 2. grants ------------------------------------------------------------------
-- anon never needs these tables: every caller either answers 401 first or uses
-- the service client. No route uses TRUNCATE, REFERENCES, TRIGGER or MAINTAIN,
-- and no UPDATE policy exists on the three tables in the last line, so these
-- revokes change no behavior.
revoke all on table public.post_likes, public.comment_likes, public.post_reposts,
                    public.connections, public.events, public.rsvps from anon;
revoke truncate, references, trigger, maintain
  on table public.post_likes, public.comment_likes, public.post_reposts,
           public.connections, public.events, public.rsvps from authenticated;
revoke update on table public.post_likes, public.comment_likes, public.connections from authenticated;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
