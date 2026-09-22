-- Week 1 / batch B2: a hidden club's posts are hidden by the database, not
-- only by the routes. Comments, reposts, saves and view counts follow the post.
--
-- WHY THIS EXISTS. The routes show a hidden club's post only to its author,
-- the club's members and platform admins (rulings H7,
-- src/lib/orgs/hidden-org-access.ts). The database shows it to everyone. The
-- browser holds the anon key, so any signed-in student can skip the routes and
-- ask PostgREST with their own session:
--   * GET /rest/v1/posts?org_id=eq.<club>. posts_select_authenticated is
--     ((status = 'published') OR (user_id = auth.uid())): every published post
--     of a hidden club comes back, words and media keys included.
--   * GET /rest/v1/post_comments?post_id=eq.<post>.
--     post_comments_select_authenticated is USING (true): every comment on
--     every post, hidden clubs' and drafts' too (session 63 handoff §8).
--   * POST /rest/v1/post_comments, /post_reposts, /bookmarks, and PATCH
--     /post_reposts. The write checks only ask "is it you (and did you accept
--     the Terms)", so a student can comment on, repost and save a post of a
--     club that is hidden from them.
--   * POST /rest/v1/rpc/record_post_view. SECURITY DEFINER, EXECUTE for anon
--     and authenticated, and it counts a view on any post id without asking
--     whether the caller may see the post.
-- orgs_select already hides the club row itself. Its posts are the gap.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES
--   1. public.org_content_visible(p_org_id), the one question every change
--      below asks: true when there is no club, the club is not hidden, the
--      caller is a member, or the caller is a platform admin; false for a club
--      that does not exist, and for anon. The same rule as orgContentAccess /
--      viewerMaySeeHiddenOrg, so a route and the database give one answer.
--   2. posts_select_authenticated: a published post of a hidden club is
--      visible only when the helper says so. The author always sees their own
--      posts, even after leaving the club.
--   3. post_comments_select_authenticated: a comment is visible when its post
--      is, and your own comments always are. post_comments_insert_own: you can
--      only comment on a post you can see.
--   4. post_reposts_insert_own / post_reposts_update_own / bookmarks_all_own:
--      you can only repost, edit your repost of, or save a post you can see.
--   5. record_post_view: no view is counted on a hidden club's post for
--      someone the club is hidden from.
-- Private (invite-only) clubs are untouched on purpose: their posts stay in
-- the feed, because that is how students find them. Only hidden_at matters.
--
-- DOES NOT: revoke anything (standing rule, rulings.md: on this Postgres image
-- calling a function without EXECUTE crashes the backend, so the helper is
-- granted to anon, authenticated and service_role and refuses inside). No row
-- is touched. No DELETE policy changes: a student can still delete their own
-- comment, repost or save on a post that has since been hidden from them. The
-- count RPCs post_engagement_counts / comment_like_counts keep their own copy
-- of the rule (20260922100000), which leaves platform admins out; see
-- FOLLOW-UP.
--
-- WHY THESE SHAPES
--   * The helper is SECURITY DEFINER because orgs_select hides a hidden club
--     from non-members; a policy that joined orgs under the caller's RLS would
--     also hide every private club's posts (the same reason event_visible is a
--     DEFINER helper). `set search_path = ''`, so every name in it is
--     schema-qualified. It reads org_members itself instead of calling
--     is_org_member: the viewer here is always auth.uid(), and is_org_member's
--     answer depends on the uid it is handed (20260922120500).
--   * Cost. A post with no club never calls the helper: `org_id is null or`
--     sits in the policy itself. A club post costs one orgs primary-key probe.
--     A hidden club's post adds one probe of the unique (org_id, user_id)
--     index on org_members and, for a non-member, one users primary-key probe.
--     Each extra probe runs only when the one before it said no.
--   * Comments ask `exists (select 1 from public.posts p where p.id =
--     post_comments.post_id)`. That runs posts' own policy, so the rule lives
--     in one place; a post_visible() helper would do the same primary-key
--     probe and keep a second copy of the rule, which is how the two drift
--     apart. A comment list is one post's comments (the route caps it at 500),
--     so it is at most 500 probes of one index page, the helper only for a
--     club post, or one hashed pass over the visible posts when the planner
--     finds that cheaper.
--   * The own-comment arm of the comments SELECT policy is required, not a
--     courtesy: Postgres applies SELECT policies to DELETE ... WHERE, so
--     without it a former member could no longer delete their own comment on
--     a hidden club's post through post_comments_delete_own. The INSERT check
--     has no such arm: nobody writes a new comment on a post they can't see.
--   * New expressions use `(select auth.uid())`, read once per query. The
--     conditions kept from the old policies are restated word for word
--     (ALTER POLICY replaces the whole expression, as in
--     20260906130000_consent_db_boundary.sql).
--
-- ACCEPTED LEAK (same as event_visible, T1 Risk 3). rpc/org_content_visible
-- takes any uuid, so a signed-in student can ask whether a given club is
-- hidden from them. Club uuids are not guessable, and anon always gets false.
--
-- ---------------------------------------------------------------------------
-- MEASURED ON THE LOCAL STACK (read-only psql, 2026-09-22). Production was not
-- read by this batch; the orchestrator's reading the same day gives the same
-- posts and post_comments policies. PRE-FLIGHT b re-reads production, and the
-- body aborts on any difference.
--   * The 12 policies on the four tables (TO authenticated, PERMISSIVE):
--       posts          posts_select_authenticated   SELECT
--                        ((status = 'published'::text) OR (user_id = auth.uid()))
--                      posts_insert_authenticated / posts_update_own /
--                      posts_delete_own (unchanged)
--       post_comments  post_comments_select_authenticated  SELECT  true
--                      post_comments_insert_own  INSERT  WITH CHECK
--                        ((auth.uid() = user_id) AND has_recorded_consent())
--                      post_comments_delete_own (unchanged)
--       post_reposts   post_reposts_insert_own  INSERT  WITH CHECK
--                        ((auth.uid() = user_id) AND has_recorded_consent())
--                      post_reposts_update_own  UPDATE  USING and WITH CHECK
--                        (auth.uid() = user_id)
--                      post_reposts_select_own / _delete_own (unchanged)
--       bookmarks      bookmarks_all_own  ALL  USING and WITH CHECK
--                        (auth.uid() = user_id)
--   * relacl: authenticated has arwdDxtm on post_comments and bookmarks, arwd
--     on post_reposts, and on posts SELECT/DELETE plus column INSERT (no
--     org_id) and UPDATE (content, status, tags only), so nobody can move a
--     post into or out of a club over REST. bookmarks.post_id is NOT NULL.
--   * record_post_view: md5(pg_get_functiondef) 8370ec8c65d2930bd4140dace32dc8e4,
--     ACL {postgres=X, authenticated=X, service_role=X, anon=X}. It reads only
--     user_id today; this file adds org_id to that read.
--   * No view, no other policy (any schema) and no invoker function reads
--     posts or post_comments. The DEFINER readers (comment_like_counts,
--     post_engagement_counts, notify_on_comment_insert, notify_on_like_insert,
--     posts_stamp_campus) skip RLS and are untouched.
--   * public.org_content_visible does not exist. 0 public non-trigger
--     functions deny EXECUTE to anon or authenticated.
--   * Local data: 4 test clubs, 1 hidden (test_hidden_club, no posts), 0
--     comments, 0 bookmarks. Nothing to back-fill.
--
-- EVERY OTHER TABLE THAT HANGS OFF A POST OR A COMMENT (pg_policies + relacl)
--   post_likes, comment_likes  authenticated has SELECT only, own rows; writes
--                   are service-role routes (20260922120000). Safe, no change.
--   post_views      RLS on, no policies: no direct path. Safe.
--   reports         INSERT with your own reporter_id, nothing read back.
--                   Reporting a post by id is the moderation channel. Safe.
--   notifications   no INSERT grant (rows come from DEFINER triggers and
--                   service-role routes), SELECT own. Their post and comment
--                   embeds now go through the policies above. Safe.
--   users.pinned_post_id  the pinned post is opened through GET
--                   /api/posts/[id], which checks the club. Safe.
--
-- SELECT WALK (grep of src/, 2026-09-22; no public/ file talks to PostgREST,
-- and the browser client reads no post table). Every read of posts or
-- post_comments on the viewer's cookie client, and what it does now for
-- someone a club is hidden from. Everyone else sees exactly what they did.
--   Same answer as today (the route already drops or refuses these):
--   * GET /api/posts/[id]: the row read comes back empty, so 404 "Post not
--     found", the answer B1's club check gives.
--   * posts/[id]/like and comments/[id]/like: the post read is empty, so the
--     same 404 as orgContentAccess. postAccessForCaller (B1) the same.
--   * GET /api/feed: hidden clubs' posts never come back, and the route drops
--     them already (shownRows). They also stop taking candidate slots.
--   * GET /api/users/[handle]/reposts: originals of a hidden club were
--     already dropped (org came back null).
--   * DELETE /api/posts/[id] by someone who isn't the author: 404 instead of
--     403. Both refuse.
--   * Own posts only, so no change: me/posts, publish-post, PATCH
--     /api/posts/[id], me/pinned for your own post, creator-stats (comment
--     counts on your own posts), assertPostOwner in lib/metrics.
--   Changes the routes did NOT make before (each one closes a leak):
--   * GET /api/posts/[id]/comments: an empty list, apart from your own old
--     comments, where it used to return every comment (the §8 leak). B1 adds
--     the 404 in front.
--   * POST comments, repost POST / PATCH, save POST: the INSERT or UPDATE is
--     refused (42501), which these routes answer with 500 "Request failed"
--     until B1's 404 check runs first. They used to succeed.
--   * POST /api/posts/[id]/view: counted:false; it used to count.
--   * GET /api/users/[handle]/posts, signed in: the grid stops showing the
--     person's posts in a club hidden from the viewer. The signed-out branch
--     reads with the service role and still shows them (follow-up).
--   * GET /api/me/bookmarks: a saved post of a now-hidden club drops out of
--     the Saved list (posts!inner). The bookmark row stays and can be removed.
--   * DM threads: sharing a hidden club's post answers 404 "Attachment not
--     found"; one shared earlier comes back with attachment null, the case
--     a deleted post already takes (the phone shows "Post unavailable").
--   * GET /api/me/notifications and /api/me/otto: a mention or reply about a
--     hidden club's post keeps its row but loses the post / comment snippet
--     (left join, post null).
--   * GET /api/trending/hashtags: hidden clubs' tags stop counting.
--   * PATCH /api/me/pinned with someone else's hidden club post: 404.
--   Service-client reads (orgs pages, the club post route, the media route,
--   post-audience, the feed's club and reposter reads) skip RLS: no change.
--
-- FOLLOW-UP (not in this file). post_engagement_counts and
-- comment_like_counts already leave hidden clubs' posts out, but their copy of
-- the rule has no platform-admin arm, while this helper and orgContentAccess
-- do. A platform admin who is not a member sees such a post with 0 likes and 0
-- reposts. Consistent enough for now; a later file can make both RPCs call
-- public.org_content_visible.
--
-- DEPLOY ORDER. Either order is safe; B1's route code first is nicer.
--   * B1's routes live, this file not yet (production today): the routes are
--     the only lock, and direct REST stays open until this file is applied.
--   * This file live, B1's routes not: comment, repost and save on a hidden
--     club's post by someone it is hidden from fail with 42501 and the routes
--     answer 500 "Request failed" instead of 404. Still refused, just a worse
--     message. Every other post works exactly as before.
--   * Both live: they answer the same. The routes' cookie-client post read
--     comes back empty, which is the same "not found" B1's check gives.
--   Rolling Vercel back past B1 with this file applied is safe (the M9 rule
--   does not bite here): old code only loses rows it was meant to hide, and
--   its refusals turn into 500s.
--   ALTER POLICY takes an ACCESS EXCLUSIVE lock on posts, post_comments,
--   post_reposts and bookmarks until COMMIT (milliseconds). lock_timeout 5s
--   makes the file fail whole instead of queueing behind a long reader and
--   stalling the feed; then simply run it again.
--
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes).
--   0. PRE-FLIGHT, read-only. STOP on anything you can't explain.
--      a. Version gate (rulings H2): my predecessor present, my own version
--         absent.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260922130000', '20260922140000')
--            ORDER BY 1;
--           -- expect exactly ONE row: 20260922130000.
--           -- 20260922140000 present: already applied. STOP.
--           -- 20260922130000 missing (P1's file still waits for Franky's
--           --   yes): this file does not depend on it. Renumber this file
--           --   first, to a version above every applied version and below
--           --   20260922130000, so `supabase db reset` replays the order
--           --   production saw. Then run this gate again with the new number.
--      b. The state this file was written against (the body re-checks all of
--         it and aborts otherwise):
--           SELECT tablename, policyname, cmd, roles, permissive, qual, with_check
--             FROM pg_policies
--            WHERE schemaname = 'public'
--              AND tablename IN ('posts', 'post_comments', 'post_reposts', 'bookmarks')
--            ORDER BY 1, 2;   -- the 12 policies in MEASURED, same text
--           SELECT md5(pg_get_functiondef('public.record_post_view(uuid)'::regprocedure));
--           -- 8370ec8c65d2930bd4140dace32dc8e4 (local). A different md5 on
--           -- production: STOP, re-read the body, and rebuild both this
--           -- file's copy and the ROLLBACK copy from it.
--           SELECT to_regprocedure('public.org_content_visible(uuid)');  -- null
--      c. No long transaction to queue behind:
--           SELECT pid, now() - xact_start, state, left(query, 80)
--             FROM pg_stat_activity
--            WHERE xact_start < now() - interval '30 seconds';   -- 0 rows
--      d. The local-stack acceptance for B2 passed, log in the handoff.
--   1. Apply with the management-API curl recipe
--      (20260912102000_users_media_url_host_lock.sql:92-104), --rawfile at
--      this file. `[]` means success; a JSON error means nothing was applied.
--   2. Record it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260922140000', 'hidden_club_content_rls');
--
-- POST-CHECK (read-only; the body also checks all of this and aborts).
--   SELECT tablename, policyname, qual, with_check FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('posts', 'post_comments', 'post_reposts', 'bookmarks')
--    ORDER BY 1, 2;
--   -- still 12 rows. posts_select_authenticated has
--   --   ((org_id IS NULL) OR org_content_visible(org_id)) inside the
--   --   published arm; the comments SELECT policy, post_comments_insert_own,
--   --   post_reposts_insert_own / _update_own and bookmarks_all_own's
--   --   WITH CHECK have EXISTS ( SELECT 1 FROM posts p WHERE (p.id = ...post_id));
--   --   every condition kept from before reads as it did.
--   SELECT has_function_privilege('anon', 'public.org_content_visible(uuid)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.org_content_visible(uuid)', 'EXECUTE'),
--          has_function_privilege('service_role', 'public.org_content_visible(uuid)', 'EXECUTE');
--   -- t | t | t
--   SELECT prosrc ~ 'org_content_visible' FROM pg_proc
--    WHERE oid = 'public.record_post_view(uuid)'::regprocedure;   -- t
--   SELECT count(*) FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--      AND format_type(p.prorettype, null) NOT IN ('trigger', 'event_trigger')
--      AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
--           OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- 0 (standing rule)
--   SMOKE, GET-only (rulings M8), with Franky's session cookie, compared with
--   the same GETs just before applying: GET /api/feed (same number of posts),
--   GET /api/posts/<a personal post> and its /comments (200, same comment
--   count), the SAE club page (same posts). A post outside a hidden club that
--   drops out means a policy is wrong: ROLLBACK at once.
--
-- LOCAL ACCEPTANCE PROBES (acceptance agent only, local stack, after seeding a
-- published post P by a member of test_hidden_club, with one comment on it).
-- Every function involved is granted to the calling role, so none of these
-- can hit the EXECUTE crash.
--   As a signed-in non-member (not an admin, Terms accepted, so a refusal is
--   the club check's and not the consent check's), over REST with the anon key:
--     GET posts?id=eq.P → []   GET post_comments?post_id=eq.P → []
--     POST post_comments / post_reposts / bookmarks for P → 403 (42501);
--       the same three on a personal post → 201 (the control)
--     POST rpc/record_post_view {"p_post_id": P} → false, view_count unchanged
--     PATCH post_reposts for a repost of P seeded as postgres → 403
--     DELETE a comment of theirs on P seeded as postgres → 204, row gone
--   As the club's owner, and as a non-member platform admin: P and its
--   comments come back, and commenting works. As P's author after leaving the
--   club: P comes back. A personal post and a private club's post: unchanged
--   for everyone.
--
-- ROLLBACK (one transaction; restores ONLY this file's change; the routes keep
-- their own checks). The policy texts are the MEASURED ones, and the function
-- is record_post_view's pg_get_functiondef output verbatim. Copy the block and
-- strip the first five characters ("--   ") of each line. Order matters: the
-- policies and record_post_view stop calling the helper before the DROP. A
-- policy still calling it makes the DROP fail (the safety catch);
-- record_post_view would not, so it goes first.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   ALTER POLICY posts_select_authenticated ON public.posts
--     USING ((status = 'published'::text) OR (user_id = auth.uid()));
--   ALTER POLICY post_comments_select_authenticated ON public.post_comments
--     USING (true);
--   ALTER POLICY post_comments_insert_own ON public.post_comments
--     WITH CHECK ((auth.uid() = user_id) AND public.has_recorded_consent());
--   ALTER POLICY post_reposts_insert_own ON public.post_reposts
--     WITH CHECK ((auth.uid() = user_id) AND public.has_recorded_consent());
--   ALTER POLICY post_reposts_update_own ON public.post_reposts
--     USING (auth.uid() = user_id)
--     WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY bookmarks_all_own ON public.bookmarks
--     USING (auth.uid() = user_id)
--     WITH CHECK (auth.uid() = user_id);
--   CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid)
--    RETURNS boolean
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_user_id uuid := auth.uid();
--     v_author uuid;
--     v_inserted boolean := false;
--   BEGIN
--     IF v_user_id IS NULL THEN
--       RETURN false;
--     END IF;
--
--     SELECT user_id INTO v_author
--       FROM public.posts
--      WHERE id = p_post_id;
--
--     IF v_author IS NULL THEN
--       -- Deleted or never-existed post. The FK would have rejected the insert.
--       RETURN false;
--     END IF;
--
--     IF v_author = v_user_id THEN
--       -- Looking at your own post doesn't count. Mirrors record_profile_view.
--       RETURN false;
--     END IF;
--
--     INSERT INTO public.post_views (post_id, user_id)
--     VALUES (p_post_id, v_user_id)
--     ON CONFLICT (post_id, user_id, viewed_on) DO NOTHING
--     RETURNING true INTO v_inserted;
--
--     IF v_inserted THEN
--       UPDATE public.posts
--          SET view_count = view_count + 1
--        WHERE id = p_post_id;
--     END IF;
--
--     RETURN COALESCE(v_inserted, false);
--   END;
--   $function$;
--   DROP FUNCTION IF EXISTS public.org_content_visible(uuid);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922140000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- Afterwards md5(pg_get_functiondef('public.record_post_view(uuid)'::regprocedure))
-- reads 8370ec8c65d2930bd4140dace32dc8e4 again. CREATE OR REPLACE keeps its
-- owner and ACL. DROP FUNCTION is not a revoke (standing rule): a call to a
-- function that no longer exists is a plain "does not exist" error, no crash.
-- ---------------------------------------------------------------------------

begin;

-- ALTER POLICY holds an ACCESS EXCLUSIVE lock on each table until COMMIT.
-- This makes the file fail whole instead of queueing behind a long reader.
set local lock_timeout = '5s';

-- 0a. The 12 policies on the four tables must be the MEASURED ones, word for
--     word. A 13th permissive policy would OR around every check below, and a
--     changed text would make the ROLLBACK restore the wrong thing. Any
--     difference aborts the whole file (and a second run stops here).
do $$
declare
  want text := concat_ws(E'\n',
    'bookmarks.bookmarks_all_own ALL (auth.uid() = user_id) | (auth.uid() = user_id)',
    'post_comments.post_comments_delete_own DELETE (auth.uid() = user_id) | -',
    'post_comments.post_comments_insert_own INSERT - | ((auth.uid() = user_id) AND has_recorded_consent())',
    'post_comments.post_comments_select_authenticated SELECT true | -',
    'post_reposts.post_reposts_delete_own DELETE (auth.uid() = user_id) | -',
    'post_reposts.post_reposts_insert_own INSERT - | ((auth.uid() = user_id) AND has_recorded_consent())',
    'post_reposts.post_reposts_select_own SELECT (user_id = ( SELECT auth.uid() AS uid)) | -',
    'post_reposts.post_reposts_update_own UPDATE (auth.uid() = user_id) | (auth.uid() = user_id)',
    'posts.posts_delete_own DELETE (auth.uid() = user_id) | -',
    'posts.posts_insert_authenticated INSERT - | ((auth.uid() = user_id) AND has_recorded_consent())',
    'posts.posts_select_authenticated SELECT ((status = ''published''::text) OR (user_id = auth.uid())) | -',
    'posts.posts_update_own UPDATE (auth.uid() = user_id) | ((auth.uid() = user_id) AND has_recorded_consent())');
  got text;
  bad text;
begin
  select string_agg(format('%s.%s %s %s | %s', tablename, policyname, cmd,
                           coalesce(qual, '-'), coalesce(with_check, '-')),
                    E'\n' order by tablename::text collate "C", policyname::text collate "C")
    into got
    from pg_policies
   where schemaname = 'public'
     and tablename in ('posts', 'post_comments', 'post_reposts', 'bookmarks');
  -- pg_policies writes `public.` in front of a function only when public is
  -- off the session's search_path. Drop it so the answer doesn't depend on
  -- how the file is run.
  got := replace(got, 'public.', '');
  if got is distinct from want then
    raise exception 'b2: the post policies are not the ones this file was written against; stop and re-read them:%',
      E'\n' || coalesce(got, '(none)');
  end if;

  select string_agg(tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public'
     and tablename in ('posts', 'post_comments', 'post_reposts', 'bookmarks')
     and (roles <> array['authenticated']::name[] or permissive <> 'PERMISSIVE');
  if bad is not null then
    raise exception 'b2: expected every post policy to be TO authenticated and PERMISSIVE: %', bad;
  end if;

  select string_agg(c.relname, ', ') into bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('posts', 'post_comments', 'post_reposts', 'bookmarks')
     and not c.relrowsecurity;
  if bad is not null then
    raise exception 'b2: row level security is off on: %', bad;
  end if;
end $$;

-- 0b. record_post_view must be the body read on 2026-09-22 (the ROLLBACK
--     restores exactly that one), and the helper's name must be free.
do $$
declare
  h text := md5(pg_get_functiondef('public.record_post_view(uuid)'::regprocedure));
begin
  if h is distinct from '8370ec8c65d2930bd4140dace32dc8e4' then
    raise exception 'b2: record_post_view has an unexpected body (md5 %); stop and re-read it', h;
  end if;
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.proname = 'org_content_visible') then
    raise exception 'b2: public.org_content_visible already exists; stop and re-read it';
  end if;
end $$;

-- 1. The helper -------------------------------------------------------------

-- May the caller see what belongs to this club: its posts, their comments, a
-- repost or save of one, a view on one? No club: yes. The club is not hidden:
-- yes, private clubs included. Hidden: only its members and platform admins.
-- A club that doesn't exist: no. Anon: no (every policy that calls this is TO
-- authenticated anyway). The author's own-post exemption belongs to the
-- callers, because this doesn't know whose post it is. Each probe runs only
-- when the one before it said no: orgs by primary key, then org_members by its
-- unique (org_id, user_id) index, then users by primary key.
create function public.org_content_visible(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_setting('role', true) is distinct from 'anon'
     and (p_org_id is null
          or exists (
               select 1
                 from public.orgs o
                where o.id = p_org_id
                  and (o.hidden_at is null
                       or exists (select 1
                                    from public.org_members m
                                   where m.org_id = p_org_id
                                     and m.user_id = (select auth.uid()))
                       or exists (select 1
                                    from public.users u
                                   where u.id = (select auth.uid())
                                     and u.is_platform_admin))));
$$;

comment on function public.org_content_visible(uuid) is
  'B2 policy helper: true when there is no club, the club is not hidden, or the caller (auth.uid()) is a member or a platform admin; false for a missing club and for anon. The same rule as orgContentAccess in src/lib/orgs/hidden-org-access.ts. Called by posts_select_authenticated and record_post_view.';

-- Standing rule (rulings.md): every role that could reach it may call it, and
-- it refuses inside (anon gets false). Nothing is revoked.
grant execute on function public.org_content_visible(uuid) to anon, authenticated, service_role;

-- 2. posts -----------------------------------------------------------------
-- A published post of a hidden club only for those the helper lets in; your
-- own posts always, even after you leave the club. `org_id is null or` sits
-- here, not in the helper, so a post with no club never calls it.
alter policy posts_select_authenticated on public.posts
  using (
    (status = 'published'
      and (org_id is null or public.org_content_visible(org_id)))
    or user_id = (select auth.uid())
  );

-- 3. post_comments ---------------------------------------------------------
-- A comment is visible when its post is (the EXISTS runs posts' policy just
-- above), and your own always are, so post_comments_delete_own keeps working
-- on a post that was hidden from you after you commented.
alter policy post_comments_select_authenticated on public.post_comments
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.posts p where p.id = post_comments.post_id)
  );

-- Commenting needs a post you can see. The two existing conditions are
-- restated word for word.
alter policy post_comments_insert_own on public.post_comments
  with check (
    (auth.uid() = user_id)
    and public.has_recorded_consent()
    and exists (select 1 from public.posts p where p.id = post_comments.post_id)
  );

-- 4. post_reposts and bookmarks --------------------------------------------
-- Reposting, editing a repost's quote and saving need a post you can see. The
-- USING clauses are unchanged, so you can still see and delete your own
-- repost or save of a post that was hidden from you later.
alter policy post_reposts_insert_own on public.post_reposts
  with check (
    (auth.uid() = user_id)
    and public.has_recorded_consent()
    and exists (select 1 from public.posts p where p.id = post_reposts.post_id)
  );

alter policy post_reposts_update_own on public.post_reposts
  using (auth.uid() = user_id)
  with check (
    (auth.uid() = user_id)
    and exists (select 1 from public.posts p where p.id = post_reposts.post_id)
  );

-- bookmarks.post_id is NOT NULL, so there is no "no post" case to let through.
alter policy bookmarks_all_own on public.bookmarks
  using (auth.uid() = user_id)
  with check (
    (auth.uid() = user_id)
    and exists (select 1 from public.posts p where p.id = bookmarks.post_id)
  );

-- 5. record_post_view --------------------------------------------------------
-- The body read on 2026-09-22 with two changes: the post read also takes
-- org_id, and a hidden club's post counts no view from someone the club is
-- hidden from. It runs after the own-post return, so the author is already
-- out of the way (their own views never count anyway). CREATE OR REPLACE
-- keeps the owner and ACL; nothing is granted or revoked.
CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_author uuid;
  v_org_id uuid;
  v_inserted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT user_id, org_id INTO v_author, v_org_id
    FROM public.posts
   WHERE id = p_post_id;

  IF v_author IS NULL THEN
    -- Deleted or never-existed post. The FK would have rejected the insert.
    RETURN false;
  END IF;

  IF v_author = v_user_id THEN
    -- Looking at your own post doesn't count. Mirrors record_profile_view.
    RETURN false;
  END IF;

  IF v_org_id IS NOT NULL AND NOT public.org_content_visible(v_org_id) THEN
    -- A hidden club's post, and the club is hidden from this viewer: to them
    -- the post doesn't exist, so it answers like a missing one.
    RETURN false;
  END IF;

  INSERT INTO public.post_views (post_id, user_id)
  VALUES (p_post_id, v_user_id)
  ON CONFLICT (post_id, user_id, viewed_on) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    UPDATE public.posts
       SET view_count = view_count + 1
     WHERE id = p_post_id;
  END IF;

  RETURN COALESCE(v_inserted, false);
END;
$function$;

-- 6. Post-check inside the transaction: any miss aborts the whole file.
do $$
declare
  fn regprocedure := to_regprocedure('public.org_content_visible(uuid)');
  rpv regprocedure := to_regprocedure('public.record_post_view(uuid)');
  n int;
  bad text;
  probe uuid;
begin
  -- The helper: STABLE SECURITY DEFINER, empty search_path, callable by all
  -- three roles (standing rule).
  if fn is null then
    raise exception 'b2: public.org_content_visible(uuid) is missing';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = fn::oid and p.prosecdef and p.provolatile = 's'
                    and p.proconfig = array['search_path=""']) then
    raise exception 'b2: org_content_visible is not STABLE SECURITY DEFINER with an empty search_path';
  end if;
  if not (has_function_privilege('anon', fn::oid, 'EXECUTE')
          and has_function_privilege('authenticated', fn::oid, 'EXECUTE')
          and has_function_privilege('service_role', fn::oid, 'EXECUTE')) then
    raise exception 'b2: org_content_visible must be executable by anon, authenticated and service_role';
  end if;

  -- The six changed policies say what this file wrote. Patterns allow for
  -- pg_policies writing `public.` or the table name in front, or not.
  select string_agg(w.pol || ' ~ ' || w.pattern, '; ') into bad
    from (values
      ('posts',         'posts_select_authenticated',         'qual',       'org_content_visible\(org_id\)'),
      ('posts',         'posts_select_authenticated',         'qual',       'org_id IS NULL'),
      ('posts',         'posts_select_authenticated',         'qual',       'status = ''published'''),
      ('posts',         'posts_select_authenticated',         'qual',       'user_id = \( SELECT auth\.uid\(\) AS uid\)'),
      ('post_comments', 'post_comments_select_authenticated', 'qual',       'user_id = \( SELECT auth\.uid\(\) AS uid\)'),
      ('post_comments', 'post_comments_select_authenticated', 'qual',       'EXISTS'),
      ('post_comments', 'post_comments_select_authenticated', 'qual',       'FROM (public\.)?posts p'),
      ('post_comments', 'post_comments_select_authenticated', 'qual',       'p\.id = (post_comments\.)?post_id'),
      ('post_comments', 'post_comments_insert_own',           'with_check', 'auth\.uid\(\) = user_id'),
      ('post_comments', 'post_comments_insert_own',           'with_check', 'has_recorded_consent\(\)'),
      ('post_comments', 'post_comments_insert_own',           'with_check', 'p\.id = (post_comments\.)?post_id'),
      ('post_reposts',  'post_reposts_insert_own',            'with_check', 'auth\.uid\(\) = user_id'),
      ('post_reposts',  'post_reposts_insert_own',            'with_check', 'has_recorded_consent\(\)'),
      ('post_reposts',  'post_reposts_insert_own',            'with_check', 'p\.id = (post_reposts\.)?post_id'),
      ('post_reposts',  'post_reposts_update_own',            'with_check', 'auth\.uid\(\) = user_id'),
      ('post_reposts',  'post_reposts_update_own',            'with_check', 'p\.id = (post_reposts\.)?post_id'),
      ('bookmarks',     'bookmarks_all_own',                  'with_check', 'auth\.uid\(\) = user_id'),
      ('bookmarks',     'bookmarks_all_own',                  'with_check', 'p\.id = (bookmarks\.)?post_id')
    ) as w(tbl, pol, side, pattern)
   where not exists (
     select 1 from pg_policies pp
      where pp.schemaname = 'public' and pp.tablename = w.tbl and pp.policyname = w.pol
        and coalesce(case w.side when 'qual' then pp.qual else pp.with_check end, '') ~ w.pattern);
  if bad is not null then
    raise exception 'b2: a policy does not read as written: %', bad;
  end if;

  -- Nothing else moved: still 12 policies, and the USING clauses this file
  -- restated read as before.
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('posts', 'post_comments', 'post_reposts', 'bookmarks');
  if n <> 12 then
    raise exception 'b2: expected 12 policies on the four post tables, found %', n;
  end if;
  select string_agg(policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public'
     and policyname in ('post_reposts_update_own', 'bookmarks_all_own')
     and qual is distinct from '(auth.uid() = user_id)';
  if bad is not null then
    raise exception 'b2: a USING clause changed: %', bad;
  end if;

  -- record_post_view asks the helper and is still callable by everyone.
  if not exists (select 1 from pg_proc p
                  where p.oid = rpv::oid and p.prosecdef
                    and p.prosrc ~ 'public\.org_content_visible\(v_org_id\)') then
    raise exception 'b2: record_post_view does not ask org_content_visible';
  end if;
  if not (has_function_privilege('anon', rpv::oid, 'EXECUTE')
          and has_function_privilege('authenticated', rpv::oid, 'EXECUTE')
          and has_function_privilege('service_role', rpv::oid, 'EXECUTE')) then
    raise exception 'b2: record_post_view lost EXECUTE for a role';
  end if;

  -- Behavior, as the role running this file. auth.uid() is null here, so the
  -- caller is nobody's member and no admin; skipped if a session is set.
  if public.org_content_visible(null) is not true then
    raise exception 'b2: a post with no club must be visible';
  end if;
  if public.org_content_visible('00000000-0000-0000-0000-000000000000') is not false then
    raise exception 'b2: a club that does not exist must not be visible';
  end if;
  if auth.uid() is null then
    select o.id into probe from public.orgs o where o.hidden_at is null limit 1;
    if probe is not null and public.org_content_visible(probe) is not true then
      raise exception 'b2: a club that is not hidden must be visible (org %)', probe;
    end if;
    probe := null;
    select o.id into probe from public.orgs o where o.hidden_at is not null limit 1;
    if probe is not null and public.org_content_visible(probe) is not false then
      raise exception 'b2: a hidden club must not be visible to a non-member (org %)', probe;
    end if;
  end if;

  -- Standing rule (rulings.md): no public, non-trigger function denies
  -- EXECUTE to anon or authenticated. This file revokes none; the check makes
  -- sure the database it lands on still holds that.
  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then
    raise exception 'b2: % public functions deny EXECUTE (standing rule)', n;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
