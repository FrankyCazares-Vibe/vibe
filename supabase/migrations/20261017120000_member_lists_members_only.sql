-- ---------------------------------------------------------------------------
-- 20261017120000_member_lists_members_only.sql
--
-- APPLY JUST BEFORE THE PUSH, right after 20261017100000 (M1 of the club
-- model, batch 1A; wave-3 review, findings 1 and 2). The push brings the hide
-- and title controls and the policy that says only you see the clubs you hid,
-- so this file is in first: no hide choice or title is ever written while the
-- database still shows it. The cost, for the minutes until Vercel is READY:
-- the OLD Map code reads org_members on the viewer's client, so an open
-- club's zone on the Map lists nobody and counts 0 for people outside it.
-- The new build (batch 2A) reads them with the SERVICE client. Nothing else
-- breaks: the old code names none of the columns step 1b takes back.
--
-- PLAIN ENGLISH
-- A club's member list is for its members. Today the database lets any
-- signed-in account read the full membership rows (who, role, join date, and
-- since 20261017100000 title and profile choices) of a club that is public,
-- open to anyone and not hidden, straight from the database's web interface;
-- the Map is built on that. After this file only a member reads a club's
-- rows. People outside the club see what each member chose to show on their
-- own profile (the profile route reads with the service role and filters on
-- show_on_profile), and member counts from 5 up (the app's floor).
-- And a member reads only five columns of those rows straight from the
-- database: id, org_id, user_id, role, joined_at. Whether someone hid the
-- club or their title, their club order, their title, and which officer gave
-- it and when are the server's to read (step 1b). The app shows members each
-- other's titles through its own routes, which read with the service role.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: the policy org_members_select reads as
--      20260916103000:778-788 left it, or as this file leaves it (a second
--      run); it is the only SELECT policy on org_members; is_org_member is
--      there and anon holds nothing on the table.
--   1. ALTER POLICY org_members_select USING (is_org_member(org_id,
--      auth.uid())): the open-club branch is gone, the member branch is word
--      for word. Name, command (SELECT), role (authenticated), permissive.
--   1b. COLUMNS: revoke SELECT on org_members from authenticated, then grant
--      it back on (id, org_id, user_id, role, joined_at) only. Every read of
--      show_on_profile, show_title, profile_rank, title, title_set_by and
--      title_set_at is on the service client (bootstrap, me/clubs,
--      me/clubs/[orgId], orgs/[slug]/members, members/[userId],
--      campus-map/zone; grep of Oct 18). A column added later is the
--      server's until a file grants it. On the viewer's client a
--      select=* and a `members:org_members(count)` embed are refused now
--      (PostgREST counts the whole row); every such read today, old build
--      and new, is on the service client.
--   2. POST-CHECK by catalog: the policy reads as written; authenticated
--      holds SELECT on exactly those five columns and not on the table; anon
--      on none.
--   3. POST-CHECK BY BEHAVIOUR, as signed-in students in a block that raises
--      P0C89 (this file's own code) and so undoes its role switches: in the
--      oldest club that is public, open and not hidden, a person outside it
--      reads 0 of its rows and a member reads every one. SKIPPED, and
--      recorded, when there is no such club or person. Nothing is written.
--   3b. The same for the columns, in any club with a member: that member
--      reads the five columns and is refused (42501) show_on_profile and
--      title_set_by. SKIPPED, and recorded, when no club has a member.
--   4. The APPLY RECORD in the policy's comment; notify pgrst.
--
-- DOES NOT: change who writes org_members (the server, as before); touch
-- org_members_update or org_members_delete (a member's own leave filters on
-- org_id and user_id, both still granted); touch is_org_member or
-- org_member_role (both answer only about the caller); change anything for a
-- member reading their own club's five columns, nor for the routes that read
-- with the service role (the club page's counts, the profile's clubs, the
-- officer tools); revoke anything but SELECT on org_members' table, given
-- back on its five columns.
--
-- WHO READ org_members ON THE VIEWER'S OWN CLIENT about a club they are not
-- in: the Map (campus-map/zone/route.ts:147-150, campus-map/route.ts:263-275),
-- moved to the service client in batch 2A. Every other viewer-client read is
-- about the viewer's own row or a club they belong to (spec section D,
-- verified by grep); no policy, view or invoker function on another table
-- reads org_members (read on the local catalog, Oct 16).
--
-- LIVE STATE (read on the LOCAL stack, Oct 16, 2026):
--   org_members_select  r  {authenticated}  permissive
--     USING (is_org_member(org_id, auth.uid()) OR (EXISTS ( SELECT 1
--       FROM orgs o WHERE ((o.id = org_members.org_id) AND o.is_public AND
--       (o.join_policy = 'open'::text) AND (o.hidden_at IS NULL)))))
--     md5(pg_get_expr) 4870ecf3075671ac91408924be3aced1
--   org_members acl: authenticated=rdDxtm, anon none.
--
-- SAFE TO RUN AGAIN: an ALTER POLICY with the same text; the pre-flight takes
-- the old expression or this file's; the REVOKE then GRANT of step 1b ends
-- in the same five columns however often it runs.
--
-- LOCK. ALTER POLICY takes ACCESS EXCLUSIVE on org_members until COMMIT:
-- every club page, chat read and join waits those milliseconds.
-- lock_timeout 5s makes the file fail whole instead of queueing.
--
-- PRE-CHECK (read-only, on production; counts and catalog only).
--   1. Clubs whose member list any signed-in account reads today [likely 0]:
--     select count(*) from public.orgs
--      where is_public and join_policy = 'open' and hidden_at is null;
--   2. The policy [4870ecf3075671ac91408924be3aced1]:
--     select md5(pg_get_expr(polqual, polrelid)) from pg_policy
--      where polrelid = 'public.org_members'::regclass and polname = 'org_members_select';
--   3. What authenticated may read today [t | 0]:
--     select has_table_privilege('authenticated', 'public.org_members', 'select'),
--            (select count(*) from pg_attribute where attrelid = 'public.org_members'::regclass
--              and attnum > 0 and not attisdropped and attacl is not null);
--
-- HOW TO APPLY. Locally:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261017120000_member_lists_members_only.sql
-- On production only the main session applies it, right after M1 and just
-- before the push, after Franky says yes, with the connector's
-- apply_migration (the body without begin/commit), then renames the row to:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261017120000', 'member_lists_members_only') ON CONFLICT (version) DO NOTHING;
-- Check by hand once the new build serves: the Map's club zone still lists
-- the members who show the club; a club page still shows its counts; a
-- member can leave a club (the leave deletes on the viewer's client).
--
-- ROLLBACK (one transaction; it reopens every open club's member list to
-- every signed-in account, and every column to members, title and profile
-- choices included):
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   revoke select (id, org_id, user_id, role, joined_at) on public.org_members from authenticated;
--   grant select on public.org_members to authenticated;
--   alter policy org_members_select on public.org_members using ((is_org_member(org_id, auth.uid()) OR (EXISTS ( SELECT 1 FROM orgs o WHERE ((o.id = org_members.org_id) AND o.is_public AND (o.join_policy = 'open'::text) AND (o.hidden_at IS NULL))))));
--   comment on policy org_members_select on public.org_members is null;
--   delete from supabase_migrations.schema_migrations where version = '20261017120000';
--   notify pgrst, 'reload schema';
--   COMMIT;
-- REHEARSED on the local stack on Oct 16, 2026: applied twice (outsider 0,
-- member all); the ROLLBACK above put the md5 back to 4870ecf3...; applied
-- again. Locally the Map's club zone now lists nobody for people outside a
-- club until batch 2A's service-client read lands (the order the header asks
-- for on production).
-- Step 1b REHEARSED on the local stack on Oct 18, 2026 (wave-3 repair):
-- applied twice (columns check passed both times); the ROLLBACK's two grant
-- lines put the table back to authenticated=rdDxtm with no column grants;
-- scripts/sql/club-model-check.sql's R7 cases pass; as a member through the
-- local PostgREST, the app's reads (own rows, roster, counts, the "mine"
-- embed, the leave's DELETE) answered as before and every read of the six
-- other columns, select=* and a members(count) embed answered 42501; the new
-- build's club, profile, map, chat and feed routes answered 200 with no
-- permission error in the database log.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
declare
  old_md5 constant text := '4870ecf3075671ac91408924be3aced1';
  -- This file's expression (step 2's want_md5): a second run finds it.
  new_md5 constant text := '82dd252fe89c87c6baeb49d7b8a9429a';
  got text;
begin
  if to_regprocedure('public.is_org_member(uuid,uuid)') is null then
    raise exception 'member-lists: public.is_org_member(uuid,uuid) is missing';
  end if;
  select md5(pg_get_expr(p.polqual, p.polrelid)) into got from pg_policy p
   where p.polrelid = 'public.org_members'::regclass and p.polname = 'org_members_select'
     and p.polcmd = 'r' and p.polroles = array['authenticated'::regrole::oid] and p.polpermissive;
  if got is null then
    raise exception 'member-lists: org_members_select is missing, or not a permissive SELECT policy for authenticated';
  elsif got <> old_md5 and got is distinct from nullif(new_md5, '') then
    raise exception 'member-lists: org_members_select drifted (md5 %, expected %); re-read it first', got, old_md5;
  end if;
  -- Another SELECT policy (or one for every command) would keep the lists
  -- open beside this one: policies are OR-ed.
  if exists (select 1 from pg_policy p
              where p.polrelid = 'public.org_members'::regclass and p.polcmd in ('r', '*')
                and p.polname <> 'org_members_select') then
    raise exception 'member-lists: org_members has another policy that reads rows; read it first';
  end if;
  if has_table_privilege('anon', 'public.org_members', 'select') then
    raise exception 'member-lists: anon can select org_members; tell Franky first';
  end if;
  raise notice 'member-lists: pre-flight ok';
end $$;

-- 1. Members only ------------------------------------------------------------------
-- 20260916103000:778-788's member branch word for word; the open-club branch
-- is gone.
alter policy org_members_select on public.org_members
  using (is_org_member(org_id, auth.uid()));

-- 1b. Five columns for members, the rest for the server (wave-3 review,
-- finding 1). Revoking the table's SELECT takes every column's with it, so
-- the grant comes second.
revoke select on public.org_members from authenticated;
grant select (id, org_id, user_id, role, joined_at) on public.org_members to authenticated;

-- 2. POST-CHECK by catalog ------------------------------------------------------------
do $$
declare
  old_md5  constant text := '4870ecf3075671ac91408924be3aced1';
  -- Copied from the catalog after the first local apply, never typed by
  -- hand. Empty = print it and stop.
  want_md5 constant text := '82dd252fe89c87c6baeb49d7b8a9429a';
  got      text;
begin
  select md5(pg_get_expr(p.polqual, p.polrelid)) into got from pg_policy p
   where p.polrelid = 'public.org_members'::regclass and p.polname = 'org_members_select'
     and p.polcmd = 'r' and p.polroles = array['authenticated'::regrole::oid] and p.polpermissive;
  if want_md5 = '' then
    raise notice 'member-lists: md5 org_members_select = % (%)', got,
      (select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
        where p.polrelid = 'public.org_members'::regclass and p.polname = 'org_members_select');
    raise exception 'member-lists: fingerprints are empty';
  end if;
  if got is distinct from want_md5 or got = old_md5 then
    raise exception 'member-lists: post-check failed: org_members_select does not read as written (md5 %)', coalesce(got, '(missing)');
  end if;
  -- 1b: no table SELECT; exactly the five columns, in the order of the table.
  if has_table_privilege('authenticated', 'public.org_members', 'select') then
    raise exception 'member-lists: post-check failed: authenticated still holds SELECT on the table';
  end if;
  select string_agg(a.attname, ',' order by a.attnum) into got from pg_attribute a
   where a.attrelid = 'public.org_members'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.org_members', a.attname, 'select');
  if got is distinct from 'id,org_id,user_id,role,joined_at' then
    raise exception 'member-lists: post-check failed: authenticated reads the columns %, expected id,org_id,user_id,role,joined_at', coalesce(got, '(none)');
  end if;
  if has_any_column_privilege('anon', 'public.org_members', 'select') then
    raise exception 'member-lists: post-check failed: anon reads a column of org_members';
  end if;
  raise notice 'member-lists: post-check ok';
end $$;

-- 3. POST-CHECK BY BEHAVIOUR (as signed-in students; writes nothing) --------------
-- The CLUB: the oldest that is public, open to anyone and not hidden (the
-- clubs whose lists were open). The OUTSIDER: the oldest account not in it.
-- The MEMBER: its oldest member. Role and claims are set the way PostgREST
-- runs a signed-in request; the raise of P0C89 undoes both. Only counts
-- leave the block.
do $$
declare
  me     text := current_user;
  v_org  uuid;
  v_out  uuid;
  v_mem  uuid;
  n_all  bigint;
  n      bigint;
  res    text := '';
  want   text;
  state  text;
begin
  select o.id into v_org from public.orgs o
   where o.is_public and o.join_policy = 'open' and o.hidden_at is null
     and exists (select 1 from public.org_members m where m.org_id = o.id)
   order by o.created_at, o.id limit 1;
  select u.id into v_out from public.users u
   where v_org is not null
     and not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = u.id)
   order by u.created_at, u.id limit 1;
  select m.user_id into v_mem from public.org_members m
   where m.org_id = v_org order by m.joined_at, m.user_id limit 1;
  if v_org is null or v_out is null then
    perform set_config('member_lists.probe',
      'behaviour check SKIPPED: no club that is public, open and not hidden, or nobody outside it', true);
    raise notice 'member-lists: behaviour check SKIPPED';
    return;
  end if;
  select count(*) into n_all from public.org_members m where m.org_id = v_org;
  want := 'outsider=0;member=all;';

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.org_members m where m.org_id = v_org;
    res := res || format('outsider=%s;', n);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.org_members m where m.org_id = v_org;
    res := res || format('member=%s;', case when n = n_all then 'all' else n::text || ' of ' || n_all end);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    raise exception using errcode = 'P0C89', message = res;
  exception when sqlstate 'P0C89' then
    state := sqlerrm;
  end;

  if state is distinct from want then
    raise exception 'member-lists: the behaviour probes read "%", expected "%"', coalesce(state, '(none)'), want;
  end if;
  if current_user <> me then
    raise exception 'member-lists: the post-check did not return to role %', me;
  end if;
  perform set_config('member_lists.probe', 'behaviour check passed: ' || state, true);
  raise notice 'member-lists: behaviour check passed: %', state;
end $$;

-- 3b. POST-CHECK BY BEHAVIOUR, the columns (as a member; writes nothing) ---------
-- The MEMBER: the oldest member of the oldest club that has one. They read
-- the five columns of their club's rows and are refused two of the server's.
do $$
declare
  me    text := current_user;
  v_org uuid;
  v_mem uuid;
  n     bigint;
  res   text := '';
  state text;
  want  constant text := 'five=ok;show_on_profile=refused;title_set_by=refused;';
begin
  select m.org_id, m.user_id into v_org, v_mem from public.org_members m
    join public.orgs o on o.id = m.org_id
   order by o.created_at, o.id, m.joined_at, m.user_id limit 1;
  if v_mem is null then
    perform set_config('member_lists.columns', 'columns check SKIPPED: no club has a member', true);
    raise notice 'member-lists: columns check SKIPPED';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from (select id, org_id, user_id, role, joined_at
      from public.org_members m where m.org_id = v_org) r;
    res := res || format('five=%s;', case when n > 0 then 'ok' else '0' end);
    begin
      execute format('select count(show_on_profile) from public.org_members where org_id = %L', v_org);
      res := res || 'show_on_profile=read;';
    exception when insufficient_privilege then
      res := res || 'show_on_profile=refused;';
    end;
    begin
      execute format('select count(title_set_by) from public.org_members where org_id = %L', v_org);
      res := res || 'title_set_by=read;';
    exception when insufficient_privilege then
      res := res || 'title_set_by=refused;';
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    raise exception using errcode = 'P0C89', message = res;
  exception when sqlstate 'P0C89' then
    state := sqlerrm;
  end;
  if state is distinct from want then
    raise exception 'member-lists: the columns probes read "%", expected "%"', coalesce(state, '(none)'), want;
  end if;
  if current_user <> me then
    raise exception 'member-lists: the columns check did not return to role %', me;
  end if;
  perform set_config('member_lists.columns', 'columns check passed: ' || state, true);
  raise notice 'member-lists: columns check passed: %', state;
end $$;

-- 4. The apply record, then PostgREST ------------------------------------------------
-- In the policy's comment, restated whole each run.
do $$
begin
  execute format('comment on policy org_members_select on public.org_members is %L',
    'A club''s membership rows are for its members (20261017120000; the open-club branch of 20260916103000 is gone). '
    || 'People outside a club see what each member chose to show on their profile, through the server. '
    || 'Members read five columns (id, org_id, user_id, role, joined_at); the rest are the server''s. '
    || 'APPLY RECORD ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC: '
    || coalesce(nullif(current_setting('member_lists.probe', true), ''), 'the behaviour check left no record') || '; '
    || coalesce(nullif(current_setting('member_lists.columns', true), ''), 'the columns check left no record') || '.');
end $$;

notify pgrst, 'reload schema';

commit;
