-- S67 security wave 2, batch A2 (report #4): blocks in the database, not only
-- in the routes.
--
-- WHY THIS EXISTS. A block was enforced only in app routes. The browser holds
-- the anon key, so a blocked, signed-in student could skip the routes and read
-- the blocker's published posts and comments straight over PostgREST, and
-- comment on or repost them (report 2026-09-27 #4). The only policies that
-- mention blocks are the blocks table's own and messages_insert_member.
--
-- WHAT THIS FILE DOES
--   1. public.post_comment_block_hidden(p_comment_id): true when the comment's
--      author and its POST's author are two different people in a block pair,
--      either way round. Product call 5 (waveA-build.md): a blocked person's
--      comments on your posts disappear for everyone. is_blocked_either_way
--      can't say this for a third-party reader (it answers false when neither
--      id is auth.uid()), so this narrow helper reads blocks as the owner.
--   2. posts_select_authenticated: the published branch gains
--      `NOT is_blocked_either_way(auth.uid(), user_id)`. The author branch is
--      untouched, so everyone still reads their own posts.
--   3. post_comments_select_authenticated: the not-yours branch gains
--      `NOT is_blocked_either_way(auth.uid(), user_id)` (you don't read the
--      comments of someone in a block pair with you) and
--      `NOT post_comment_block_hidden(id)` (nobody reads a comment whose author
--      and post author are a block pair). Your own comments stay yours.
--   4. public.post_comment_parent_ok(p_parent_id, p_post_id): true when there
--      is no parent, or the parent is a TOP-LEVEL comment on the SAME post
--      that the replier can read by the rules of (3): their own, or not
--      removed, author not restricted, not in a block pair with the replier,
--      and not hidden by the pair rule.
--   5. post_comments_insert_own: the live WITH CHECK word for word, plus
--      `AND post_comment_parent_ok(parent_comment_id, post_id)`.
--   6. notify pgrst, 'reload schema'.
--   Every ALTER restates the live expression word for word plus the new clause.
--
-- HOW "NO COMMENT, REPLY OR REPOST ACROSS A BLOCK" IS MET.
-- Top-level comments, reposts and saves need no WITH CHECK edit:
-- post_comments_insert_own, post_reposts_insert_own, post_reposts_update_own
-- and bookmarks_all_own all end in `EXISTS (SELECT 1 FROM posts p WHERE p.id =
-- ...)`, which runs under the caller's RLS. With (2) in place that EXISTS is
-- false for a blocked pair, so a comment, repost or save on the other
-- person's post is refused (42501). The last three stay as they are (restating
-- them would only add drift); PRE-FLIGHT and POST-CHECK pin them unchanged.
-- Replies are the exception. A reply's PARENT can belong to someone other
-- than the post's author, so without (4)/(5) a blocked person could reply
-- under the blocker's comment on a THIRD person's post, and everyone but the
-- blocker would see it threaded there (review-A2-bypass, 2026-09-28; it went
-- through the app route too, which flattens a reply-to-a-reply to its root).
-- The parent must be top-level because GET threads every reply under the
-- root of whatever it points at; checking only the immediate parent would let
-- a reply under a third person's reply land in the blocker's thread. The
-- route only ever writes a root parent, and live has no reply-to-a-reply.
-- (4) is SECURITY DEFINER because a plain EXISTS on post_comments inside a
-- post_comments policy fails with "infinite recursion detected in policy".
-- The local probes prove every refusal by behaviour
-- (handoffs/wave-plan-sec2/notes-A2.md).
--
-- DOES NOT
--   * users_select_authenticated: unchanged. A block clause there would null
--     names in every users embed (the Blocked users list you unblock from,
--     group-chat senders, the thread roster) and make campus head-counts
--     viewer-relative. Hiding people is done where it matters: users/search,
--     /api/search, bootstrap, follow lists, and now /api/users/by-id (404).
--   * post_likes / comment_likes: authenticated has no INSERT on either; the
--     like routes write with the service role after loadPairBlock.
--   * record_post_view, post_engagement_counts, comment_like_counts: numbers
--     only, not changed. The view route already stops a blocked pair (it reads
--     the post under this policy first). Residual: a blocked person calling
--     the record_post_view RPC directly can still add one view a day to the
--     count; the Vibe+ name list leaves blocked people out (product call 7).
--     The comment count on a card stays the public RPC number, so it can be
--     higher than the comments a viewer is shown.
--   * Any row, any grant beyond the two new helpers' EXECUTE. Nothing is
--     revoked (standing rule: on this image calling a function without
--     EXECUTE crashes the backend, so the helpers are granted and answer
--     inside).
--   * Residual, accepted: for an EXISTING comment id, post_comment_block_hidden
--     confirms whether that comment's author and the post's author are a
--     block pair.
--     Keyed on a comment (not on two free user ids) so it can't probe any two
--     people, and product call 5 already shows the same thing on screen (their
--     comments on that person's posts vanish for everyone). False for anon.
--   * Residual, accepted: post_comment_parent_ok is callable as an RPC. For a
--     comment id the caller already holds it answers "is this a top-level
--     comment on that post that I can read", the same rules as reading it
--     under (3), so it tells nobody more than a SELECT would; it doesn't look
--     at the post's visibility (the policy's EXISTS on posts does that). True
--     for a null parent, false otherwise for anon.
--
-- COST. posts: one SECURITY DEFINER call per published row read, one indexed
-- probe on blocks (blocks_blocker_id_blocked_id_key). post_comments: that plus
-- a post_comments + posts primary-key probe and one blocks probe per row.
-- A reply insert: one post_comments primary-key probe plus the same checks
-- on its parent. Live sizes (2026-09-27): posts 23, post_comments 11, blocks 0.
--
-- LIVE STATE (read-only MCP, 2026-09-27, production at 24dac9f):
--   counts: blocks 0, posts 23, post_comments 11, post_reposts 5, bookmarks 2.
--   RLS on for posts and post_comments; both tables and blocks are owned by
--   postgres (BYPASSRLS, no FORCE RLS), so the helper's reads don't recurse.
--   posts_select_authenticated is the ONLY SELECT/ALL policy on posts:
--     (((status = 'published'::text) AND (removed_at IS NULL) AND
--     user_visible(user_id) AND ((org_id IS NULL) OR
--     org_content_visible(org_id))) OR (user_id = ( SELECT auth.uid() AS uid)))
--   post_comments_select_authenticated is the ONLY SELECT/ALL policy there:
--     ((user_id = ( SELECT auth.uid() AS uid)) OR ((removed_at IS NULL) AND
--     user_visible(user_id) AND (EXISTS ( SELECT 1 FROM posts p WHERE (p.id =
--     post_comments.post_id)))))
--   md5(coalesce(qual,'')||'|'||coalesce(with_check,'')), live == local:
--     posts_select_authenticated          997152785d7c4188e10394c7c98a1c16
--     post_comments_select_authenticated  bc9bd5d608e9cff736fc284ee225abe3
--     post_comments_insert_own            111c5d0a128e36a6cf4bbf936561d9a9
--     post_reposts_insert_own             32d525cf1ed184b48bfa645414add24a
--     post_reposts_update_own             e44b86b68e06a9dd5ada830f10664128
--     bookmarks_all_own                   1f1a49c2d42e2473b2e2abac2ca41643
--     users_select_authenticated          e52bb54d505c551afd51cf78fd24668b
--   md5(prosrc), live == local: is_blocked_either_way
--   11a5c6dc6e744b30bf18ecc5c515716e (SECURITY DEFINER, STABLE, EXECUTE for
--   anon + authenticated), user_visible 58f1d9227ad4f90bf4630bbbb8751caa,
--   org_content_visible 771be32197d1da4b92665c1e0a1256a9.
--   public.post_comment_block_hidden does not exist.
--   Re-read 2026-09-28: post_comments_insert_own WITH CHECK (still 111c5d0a):
--     ((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now()
--     AND (EXISTS ( SELECT 1 FROM posts p WHERE (p.id =
--     post_comments.post_id))))
--   public.post_comment_parent_ok does not exist. Replies whose parent is
--   itself a reply: 0. Replies whose parent is on another post: 0.
--
-- APPLY ORDER: AFTER the deploy. /api/me/reports must already carry its
-- cross-block fallback (src/lib/moderation/report-visibility.ts), or reporting
-- a blocked pair's post or comment answers "That's not there anymore". Every
-- other A2 route change works with or without this file. Live has 0 blocks,
-- so the window is harmless in practice. Apply via the management API, then
-- insert the schema_migrations row (version 20260928120000).
--
-- ROLLBACK (one transaction):
--   BEGIN;
--   ALTER POLICY posts_select_authenticated ON public.posts
--     USING (((status = 'published'::text) AND (removed_at IS NULL)
--             AND public.user_visible(user_id)
--             AND ((org_id IS NULL) OR public.org_content_visible(org_id)))
--            OR (user_id = (SELECT auth.uid())));
--   ALTER POLICY post_comments_select_authenticated ON public.post_comments
--     USING ((user_id = (SELECT auth.uid()))
--            OR ((removed_at IS NULL) AND public.user_visible(user_id)
--                AND (EXISTS (SELECT 1 FROM public.posts p
--                              WHERE p.id = post_comments.post_id))));
--   ALTER POLICY post_comments_insert_own ON public.post_comments
--     WITH CHECK ((auth.uid() = user_id) AND public.has_recorded_consent()
--                 AND public.can_publish_now()
--                 AND (EXISTS (SELECT 1 FROM public.posts p
--                               WHERE p.id = post_comments.post_id)));
--   DROP FUNCTION IF EXISTS public.post_comment_parent_ok(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.post_comment_block_hidden(uuid);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- ALTER POLICY holds an ACCESS EXCLUSIVE lock on posts / post_comments until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT. Every policy this file changes or leans on must read exactly
--    as LIVE STATE says, no other permissive SELECT/ALL policy may OR around
--    the two it changes, RLS must be on, the functions it calls must be the
--    ones read today, and the new helpers' names must be free. Any miss aborts
--    the whole file. Only posts/post_comments SELECT is pinned on posts: A5 and
--    B2 change the posts UPDATE/DELETE policies in their own files.
do $$
declare
  want constant jsonb := jsonb_build_object(
    'posts.posts_select_authenticated',                 '997152785d7c4188e10394c7c98a1c16',
    'post_comments.post_comments_select_authenticated', 'bc9bd5d608e9cff736fc284ee225abe3',
    'post_comments.post_comments_insert_own',           '111c5d0a128e36a6cf4bbf936561d9a9',
    'post_reposts.post_reposts_insert_own',             '32d525cf1ed184b48bfa645414add24a',
    'post_reposts.post_reposts_update_own',             'e44b86b68e06a9dd5ada830f10664128',
    'bookmarks.bookmarks_all_own',                      '1f1a49c2d42e2473b2e2abac2ca41643',
    'users.users_select_authenticated',                 'e52bb54d505c551afd51cf78fd24668b');
  want_fn constant jsonb := jsonb_build_object(
    'is_blocked_either_way', '11a5c6dc6e744b30bf18ecc5c515716e',
    'user_visible',          '58f1d9227ad4f90bf4630bbbb8751caa',
    'org_content_visible',   '771be32197d1da4b92665c1e0a1256a9');
  k text;
  got text;
  bad text;
  f record;
begin
  for k in select jsonb_object_keys(want) loop
    select md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) into got
      from pg_policies
     where schemaname = 'public'
       and tablename = split_part(k, '.', 1)
       and policyname = split_part(k, '.', 2);
    if got is distinct from want ->> k then
      raise exception 'blocks-rls: policy % is not the one this file was written against (md5 %)',
        k, coalesce(got, '(missing)');
    end if;
  end loop;

  select string_agg(tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public'
     and tablename in ('posts', 'post_comments')
     and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'
     and policyname not in ('posts_select_authenticated', 'post_comments_select_authenticated');
  if bad is not null then
    raise exception 'blocks-rls: another permissive read policy would OR around this file: %', bad;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.posts'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.post_comments'::regclass) then
    raise exception 'blocks-rls: row level security is off on posts or post_comments';
  end if;

  for k in select jsonb_object_keys(want_fn) loop
    select md5(p.prosrc) into got
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = k;
    if got is distinct from want_fn ->> k then
      raise exception 'blocks-rls: public.% is not the one this file was written against (md5 %)',
        k, coalesce(got, '(missing)');
    end if;
  end loop;

  select p.prosecdef, p.provolatile into f
    from pg_proc p
   where p.oid = 'public.is_blocked_either_way(uuid, uuid)'::regprocedure;
  if not f.prosecdef or f.provolatile <> 's'
     or not has_function_privilege('authenticated', 'public.is_blocked_either_way(uuid, uuid)', 'execute') then
    raise exception 'blocks-rls: is_blocked_either_way must be STABLE SECURITY DEFINER and executable by authenticated';
  end if;

  select string_agg(p.proname, ', ') into bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('post_comment_block_hidden', 'post_comment_parent_ok');
  if bad is not null then
    raise exception 'blocks-rls: public.% already exists; stop and re-read it', bad;
  end if;
end $$;

-- 1. The helper -------------------------------------------------------------

-- Is this comment's author in a block pair (either way) with its post's author?
-- A comment on your own post is never hidden by this. No such comment: false.
-- Anon: false (no policy lets anon read comments anyway). Owner-rights reads
-- of post_comments, posts and blocks: blocks_select_either would hide a
-- third party's block row from the caller.
create function public.post_comment_block_hidden(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_setting('role', true) is distinct from 'anon'
     and exists (
           select 1
             from public.post_comments c
             join public.posts p on p.id = c.post_id
            where c.id = p_comment_id
              and c.user_id <> p.user_id
              and exists (
                    select 1
                      from public.blocks b
                     where (b.blocker_id = c.user_id and b.blocked_id = p.user_id)
                        or (b.blocker_id = p.user_id and b.blocked_id = c.user_id)));
$$;

comment on function public.post_comment_block_hidden(uuid) is
  'S67 A2 policy helper for post_comments_select_authenticated: true when the comment''s author and its post''s author are two different people in a block pair (either direction), so the comment is hidden from everyone but its author (product call 5). Keyed on an existing comment id, never on two free user ids. False for anon.';

-- Standing rule: every role that could reach it may call it; it answers inside.
grant execute on function public.post_comment_block_hidden(uuid) to anon, authenticated, service_role;

-- 1b. The reply helper. May the caller reply under p_parent_id on p_post_id?
-- No parent: yes. Otherwise the parent must be a top-level comment on that
-- same post that the caller can read under post_comments_select_authenticated
-- (section 3): their own, or not removed, author not restricted, not in a
-- block pair with the caller, not hidden by the pair rule. The post's own
-- visibility is left to the policy's EXISTS on posts. SECURITY DEFINER: a
-- sub-select on post_comments inside its own policy is "infinite recursion".
create function public.post_comment_parent_ok(p_parent_id uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_parent_id is null
      or exists (
           select 1
             from public.post_comments c
            where c.id = p_parent_id
              and c.post_id = p_post_id
              and c.parent_comment_id is null
              and (c.user_id = (select auth.uid())
                   or (c.removed_at is null
                       and public.user_visible(c.user_id)
                       and not public.is_blocked_either_way((select auth.uid()), c.user_id)
                       and not public.post_comment_block_hidden(c.id))));
$$;

comment on function public.post_comment_parent_ok(uuid, uuid) is
  'S67 A2 policy helper for post_comments_insert_own: true when p_parent_id is null, or is a top-level comment on p_post_id that the caller can read (own, or not removed, author not restricted, no block pair with the caller, not hidden by post_comment_block_hidden). Stops a reply landing in a blocked person''s thread.';

grant execute on function public.post_comment_parent_ok(uuid, uuid) to anon, authenticated, service_role;

-- Hold writes to the three tables still until COMMIT (reads go on), so the
-- BEFORE and AFTER counts below see the same rows. ALTER POLICY takes its
-- ACCESS EXCLUSIVE lock later, inside the same lock_timeout.
lock table public.posts, public.post_comments, public.blocks in share mode;

-- 2. BEFORE probe (reads only). One user with no block rows at all reads posts
--    and comments under the OLD policies, as authenticated. Kept in a
--    transaction-local setting for the POST-CHECK. `pair` = comments that user
--    reads today, not their own, whose author and post author are a block
--    pair: the only rows the new rules may take away from them.
do $$
declare
  v_uid uuid;
  n_posts bigint;
  n_comments bigint;
  n_pair bigint;
begin
  select u.id into v_uid
    from public.users u
   where not exists (select 1 from public.blocks b
                      where b.blocker_id = u.id or b.blocked_id = u.id)
   order by u.id
   limit 1;
  if v_uid is null then
    perform set_config('vibe.a2_probe', '', true);
    return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n_posts from public.posts;
  select count(*) into n_comments from public.post_comments;
  select count(*) into n_pair from public.post_comments c
   where c.user_id <> v_uid and public.post_comment_block_hidden(c.id);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('vibe.a2_probe', json_build_object(
    'uid', v_uid, 'posts', n_posts, 'comments', n_comments, 'pair', n_pair)::text, true);
end $$;

-- 3. The two read policies, then the comment insert check -------------------
-- The live expressions word for word, plus the block clauses.

alter policy posts_select_authenticated on public.posts
  using (
    ((status = 'published'::text)
      and (removed_at is null)
      and public.user_visible(user_id)
      and ((org_id is null) or public.org_content_visible(org_id))
      and (not public.is_blocked_either_way((select auth.uid()), user_id)))
    or (user_id = (select auth.uid()))
  );

alter policy post_comments_select_authenticated on public.post_comments
  using (
    (user_id = (select auth.uid()))
    or ((removed_at is null)
        and public.user_visible(user_id)
        and (not public.is_blocked_either_way((select auth.uid()), user_id))
        and (not public.post_comment_block_hidden(id))
        and (exists (select 1 from public.posts p where p.id = post_comments.post_id)))
  );

-- 3b. The comment insert check: the live WITH CHECK word for word, plus the
--     reply rule. A top-level comment passes it (null parent).
alter policy post_comments_insert_own on public.post_comments
  with check (
    (auth.uid() = user_id)
    and public.has_recorded_consent()
    and public.can_publish_now()
    and (exists (select 1 from public.posts p where p.id = post_comments.post_id))
    and public.post_comment_parent_ok(parent_comment_id, post_id)
  );

-- 4. POST-CHECK. By catalog, then by behaviour (reads only).
do $$
declare
  f record;
  q_posts text;
  q_comments text;
  q_insert record;
  k text;
  got text;
  pinned constant jsonb := jsonb_build_object(
    'post_reposts.post_reposts_insert_own',   '32d525cf1ed184b48bfa645414add24a',
    'post_reposts.post_reposts_update_own',   'e44b86b68e06a9dd5ada830f10664128',
    'bookmarks.bookmarks_all_own',            '1f1a49c2d42e2473b2e2abac2ca41643',
    'users.users_select_authenticated',       'e52bb54d505c551afd51cf78fd24668b');
  probe jsonb;
  v_uid uuid;
  n bigint;
  blk record;
  roots jsonb;
begin
  -- 4a. The helper is what section 1 says.
  select p.provolatile, p.prosecdef, p.proconfig into f
    from pg_proc p
   where p.oid = 'public.post_comment_block_hidden(uuid)'::regprocedure;
  if f.provolatile <> 's' or not f.prosecdef
     or f.proconfig is distinct from array['search_path=""'] then
    raise exception 'blocks-rls: post_comment_block_hidden is not STABLE SECURITY DEFINER with an empty search_path';
  end if;
  if not (has_function_privilege('anon', 'public.post_comment_block_hidden(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.post_comment_block_hidden(uuid)', 'execute')
          and has_function_privilege('service_role', 'public.post_comment_block_hidden(uuid)', 'execute')) then
    raise exception 'blocks-rls: post_comment_block_hidden must be executable by anon, authenticated and service_role';
  end if;
  if public.post_comment_block_hidden(gen_random_uuid()) then
    raise exception 'blocks-rls: post_comment_block_hidden is true for a comment that does not exist';
  end if;

  -- 4a'. So is the reply helper (section 1b).
  select p.provolatile, p.prosecdef, p.proconfig into f
    from pg_proc p
   where p.oid = 'public.post_comment_parent_ok(uuid, uuid)'::regprocedure;
  if f.provolatile <> 's' or not f.prosecdef
     or f.proconfig is distinct from array['search_path=""'] then
    raise exception 'blocks-rls: post_comment_parent_ok is not STABLE SECURITY DEFINER with an empty search_path';
  end if;
  if not (has_function_privilege('anon', 'public.post_comment_parent_ok(uuid, uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.post_comment_parent_ok(uuid, uuid)', 'execute')
          and has_function_privilege('service_role', 'public.post_comment_parent_ok(uuid, uuid)', 'execute')) then
    raise exception 'blocks-rls: post_comment_parent_ok must be executable by anon, authenticated and service_role';
  end if;
  if not public.post_comment_parent_ok(null, gen_random_uuid())
     or public.post_comment_parent_ok(gen_random_uuid(), gen_random_uuid()) then
    raise exception 'blocks-rls: post_comment_parent_ok must be true for no parent and false for a parent that does not exist';
  end if;

  -- 4b. Both read policies ask the block questions, and kept their old terms.
  select qual into q_posts from pg_policies
   where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_select_authenticated';
  select qual into q_comments from pg_policies
   where schemaname = 'public' and tablename = 'post_comments'
     and policyname = 'post_comments_select_authenticated';
  if q_posts is null
     or q_posts !~ 'NOT is_blocked_either_way\(\( SELECT auth\.uid\(\) AS uid\), user_id\)'
     or q_posts !~ 'user_visible\(user_id\)'
     or q_posts !~ 'org_content_visible\(org_id\)'
     or q_posts !~ '\(status = ''published''::text\)'
     or q_posts !~ '\(removed_at IS NULL\)'
     or q_posts !~ 'OR \(user_id = \( SELECT auth\.uid\(\) AS uid\)\)\)$' then
    raise exception 'blocks-rls: posts_select_authenticated does not read as written: %', q_posts;
  end if;
  if q_comments is null
     or q_comments !~ '^\(\(user_id = \( SELECT auth\.uid\(\) AS uid\)\) OR '
     or q_comments !~ 'NOT is_blocked_either_way\(\( SELECT auth\.uid\(\) AS uid\), user_id\)'
     or q_comments !~ 'NOT post_comment_block_hidden\(id\)'
     or q_comments !~ 'user_visible\(user_id\)'
     or q_comments !~ '\(removed_at IS NULL\)'
     or q_comments !~ 'p\.id = post_comments\.post_id' then
    raise exception 'blocks-rls: post_comments_select_authenticated does not read as written: %', q_comments;
  end if;

  -- 4b'. The comment insert check kept every old term and gained the reply
  --      rule, still INSERT for authenticated only, no USING.
  select qual, with_check, cmd, roles into q_insert from pg_policies
   where schemaname = 'public' and tablename = 'post_comments'
     and policyname = 'post_comments_insert_own';
  if q_insert.with_check is null or q_insert.qual is not null
     or q_insert.cmd <> 'INSERT' or q_insert.roles <> array['authenticated']::name[]
     or q_insert.with_check !~ '^\(\(auth\.uid\(\) = user_id\) AND has_recorded_consent\(\) AND can_publish_now\(\) AND \(EXISTS '
     or q_insert.with_check !~ 'WHERE \(p\.id = post_comments\.post_id\)\)\) AND post_comment_parent_ok\(parent_comment_id, post_id\)\)$' then
    raise exception 'blocks-rls: post_comments_insert_own does not read as written: %', q_insert.with_check;
  end if;

  -- 4c. The policies the cascade leans on are untouched.
  for k in select jsonb_object_keys(pinned) loop
    select md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) into got
      from pg_policies
     where schemaname = 'public'
       and tablename = split_part(k, '.', 1)
       and policyname = split_part(k, '.', 2);
    if got is distinct from pinned ->> k then
      raise exception 'blocks-rls: policy % changed under this file (md5 %)', k, coalesce(got, '(missing)');
    end if;
  end loop;

  -- 4d. Behaviour, someone with no blocks: every post they read before, they
  --     read now; they lose exactly the comments the pair rule hides.
  probe := nullif(current_setting('vibe.a2_probe', true), '')::jsonb;
  if probe is not null then
    v_uid := (probe ->> 'uid')::uuid;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.posts;
    if n <> (probe ->> 'posts')::bigint then
      raise exception 'blocks-rls: a user with no blocks now reads % posts, not %', n, probe ->> 'posts';
    end if;
    select count(*) into n from public.post_comments;
    if n <> (probe ->> 'comments')::bigint - (probe ->> 'pair')::bigint then
      raise exception 'blocks-rls: a user with no blocks now reads % comments, expected % - %',
        n, probe ->> 'comments', probe ->> 'pair';
    end if;
    -- ...and the reply rule refuses them no top-level comment they can read.
    select count(*) into n from public.post_comments c
     where c.parent_comment_id is null
       and not public.post_comment_parent_ok(c.id, c.post_id);
    if n <> 0 then
      raise exception 'blocks-rls: a user with no blocks may not reply under % top-level comments they read', n;
    end if;
    execute 'reset role';
  end if;

  -- 4e. Behaviour, a real block pair when one exists (live had none on
  --     2026-09-27, so this is exercised on the local seed): neither side reads
  --     the other's posts or comments, may reply under neither's top-level
  --     comments, and the blocker still reads all of their own posts.
  for blk in select b.blocker_id, b.blocked_id from public.blocks b
              where b.blocker_id <> b.blocked_id order by b.id limit 1 loop
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'post_id', c.post_id)), '[]'::jsonb)
      into roots
      from public.post_comments c
     where c.parent_comment_id is null and c.user_id = blk.blocked_id;
    perform set_config('request.jwt.claims',
      json_build_object('sub', blk.blocker_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.posts where user_id = blk.blocked_id;
    if n <> 0 then
      raise exception 'blocks-rls: the blocker still reads % of the blocked person''s posts', n;
    end if;
    select count(*) into n from public.post_comments where user_id = blk.blocked_id;
    if n <> 0 then
      raise exception 'blocks-rls: the blocker still reads % of the blocked person''s comments', n;
    end if;
    select count(*) into n from jsonb_to_recordset(roots) as r(id uuid, post_id uuid)
     where public.post_comment_parent_ok(r.id, r.post_id);
    if n <> 0 then
      raise exception 'blocks-rls: the blocker may still reply under % of the blocked person''s comments', n;
    end if;
    select count(*) into n from public.posts where user_id = blk.blocker_id;
    execute 'reset role';
    if n <> (select count(*) from public.posts where user_id = blk.blocker_id) then
      raise exception 'blocks-rls: the blocker lost sight of their own posts';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'post_id', c.post_id)), '[]'::jsonb)
      into roots
      from public.post_comments c
     where c.parent_comment_id is null and c.user_id = blk.blocker_id;
    perform set_config('request.jwt.claims',
      json_build_object('sub', blk.blocked_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.posts where user_id = blk.blocker_id;
    if n <> 0 then
      raise exception 'blocks-rls: the blocked person still reads % of the blocker''s posts', n;
    end if;
    select count(*) into n from public.post_comments where user_id = blk.blocker_id;
    if n <> 0 then
      raise exception 'blocks-rls: the blocked person still reads % of the blocker''s comments', n;
    end if;
    select count(*) into n from jsonb_to_recordset(roots) as r(id uuid, post_id uuid)
     where public.post_comment_parent_ok(r.id, r.post_id);
    if n <> 0 then
      raise exception 'blocks-rls: the blocked person may still reply under % of the blocker''s comments', n;
    end if;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claims', '', true);
end $$;

notify pgrst, 'reload schema';

commit;
