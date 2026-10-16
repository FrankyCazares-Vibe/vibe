-- ---------------------------------------------------------------------------
-- 20261016130000_views_old_functions_refuse.sql
--
-- APPLY ONLY AFTER THE CODE IS LIVE: the deploy whose POST /api/posts/[id]/view
-- and POST /api/profile-views call record_post_view_as and
-- record_profile_view_as through the service role (20261016120000). Push,
-- wait for Vercel READY, confirm the served build is the new one (the S65
-- stale-cache lesson), THEN apply this file. Applied while the old code is
-- still serving, every view answers counted: false and nothing is counted
-- until the deploy lands.
--
-- PLAIN ENGLISH
-- The two old view counters, record_post_view and record_profile_view, run
-- with the browser's own sign-in: anyone signed in can call them straight
-- from the database's web interface, as often as they like, and a blocked
-- person can still add a view a day (20260928120000 wrote that down as a
-- residual). Once the routes count views through the new pair, nothing
-- calls the old one. This file empties both: they answer false for
-- everyone and write nothing. Rate limits wave 3, batch B3.4 (Oct 16).
--
-- WHAT IT DOES
--   0. PRE-FLIGHT: the old pair and the new pair are there, each alone
--      under its name (so this file cannot run before 20261016120000);
--      remembers who may call the old pair.
--   1. create or replace record_post_view(uuid) and
--      record_profile_view(uuid, text) with a body that returns false. The
--      same names, arguments (p_referrer keeps its default: Postgres
--      refuses to drop one), return type, language, SECURITY DEFINER and
--      search_path, so create or replace keeps the owner and the grants.
--   2. POST-CHECK: who may call them did not move, every API role still
--      may (the standing rule), and a signed-in caller gets false with
--      nothing written, in a block undone at once.
--   3. notify pgrst.
--
-- WHY EMPTY THEM AND NOT REVOKE: the standing rule (20260922090000:47-50,
-- "A revoke is a crash button"): on Supabase's Postgres image a role calling
-- a public function it can't EXECUTE crashes the backend and drops every
-- connection. The review (Oct 15, #1) turned the plan's "revoke execute
-- from authenticated" into this. Under the service role auth.uid() is null,
-- so the old bodies already answered false there; now every caller does.
--
-- WHY KEEP THEM AT ALL: an old route still serving during the deploy calls
-- them; an empty answer (counted: false) is what the browser already
-- handles, where a missing function would answer 500. Dropping them can
-- wait for a later cleanup.
--
-- DOES NOT: touch the new pair, post_views, profile_views, view_count or
-- profile_view_count; delete any row; revoke anything.
--
-- SAFE TO RUN AGAIN: create or replace, with the same bodies.
--
-- APPLIED on the local database on 2026-10-16, twice in a row, after
-- 20261016120000. Grants compared before and after: unchanged. As
-- authenticated with a signed-in id, as anon and as the service role, both
-- answered false and wrote no row; the new pair kept counting.
-- src/lib/views/views-as-migration.test.ts keeps it from drifting.
-- Production: the main session.
--
-- LIVE STATE: not read for this file. Before applying, on production:
--   SELECT to_regprocedure('public.record_post_view_as(uuid,uuid)') IS NOT NULL    AS post_as_there,
--          to_regprocedure('public.record_profile_view_as(uuid,uuid)') IS NOT NULL AS profile_as_there;
--   -- expect t, t. Then, signed in on the new build, open a post someone
--   -- else made: its count goes up (the new pair counts) before this file.
--
-- HOW TO APPLY BY HAND: as 20261016120000, then:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261016130000', 'views_old_functions_refuse') ON CONFLICT (version) DO NOTHING;
-- Checks by hand afterwards: signed in, open someone's post and profile;
-- their counts still go up once a day.
--
-- ROLLBACK (only with the old route code back; the new code never calls
-- these): in one transaction, re-run the two bodies this file replaces,
-- each CREATE OR REPLACE statement alone:
--   record_post_view     20260923090000_moderation_foundation.sql:2655-2711
--   record_profile_view  20260513000000_profile_views_and_user_view_count.sql:51-85
--   (not the policy above it: 20260928140000 dropped that on purpose)
-- create or replace keeps the grants. Then:
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261016130000';
--   NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.record_post_view_as(uuid,uuid)') is null
     or to_regprocedure('public.record_profile_view_as(uuid,uuid)') is null then
    raise exception 'views-old: the new pair is missing; apply 20261016120000 and deploy the code first';
  end if;
  if to_regprocedure('public.record_post_view(uuid)') is null
     or to_regprocedure('public.record_profile_view(uuid,text)') is null then
    raise exception 'views-old: record_post_view(uuid) or record_profile_view(uuid,text) is missing';
  end if;
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('record_post_view', 'record_profile_view')
                and p.oid not in (to_regprocedure('public.record_post_view(uuid)')::oid,
                                  to_regprocedure('public.record_profile_view(uuid,text)')::oid)) then
    raise exception 'views-old: another record_post_view or record_profile_view sits beside the known ones';
  end if;
  -- Remembered for the post-check: who may call the old pair, exactly.
  perform set_config('vibe.views_old_acl',
                     (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, 'default'), ' '
                                        order by p.oid::regprocedure::text)
                        from pg_proc p
                       where p.oid in (to_regprocedure('public.record_post_view(uuid)')::oid,
                                       to_regprocedure('public.record_profile_view(uuid,text)')::oid)),
                     true);
end $$;

-- 1. THE OLD PAIR, EMPTIED ----------------------------------------------------
-- Everything but the body as it was, so create or replace keeps the owner
-- and the grants (anon, authenticated, service_role); no grant and no revoke.
create or replace function public.record_post_view(p_post_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $oldpost$
begin
  -- Emptied (20261016130000): a view is counted by record_post_view_as,
  -- through the server. Nothing calls this one; it answers false for
  -- everyone and writes nothing.
  return false;
end;
$oldpost$;

comment on function public.record_post_view(uuid) is
  'Emptied: answers false for everyone and writes nothing. Views are counted by record_post_view_as through POST '
  '/api/posts/[id]/view (20261016120000, emptied 20261016130000). Kept so a call cannot crash or 404.';

create or replace function public.record_profile_view(p_profile_user_id uuid, p_referrer text default null)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $oldprofile$
begin
  -- Emptied (20261016130000): a view is counted by record_profile_view_as,
  -- through the server. Nothing calls this one; it answers false for
  -- everyone and writes nothing.
  return false;
end;
$oldprofile$;

comment on function public.record_profile_view(uuid, text) is
  'Emptied: answers false for everyone and writes nothing. Views are counted by record_profile_view_as through POST '
  '/api/profile-views (20261016120000, emptied 20261016130000). Kept so a call cannot crash or 404.';

-- 2. POST-CHECK inside the transaction ---------------------------------------
do $$
declare
  bad      text := '';
  f        regprocedure;
  api      text;
  src      text;
  v_user   uuid;
  v_other  uuid;
  v_post   uuid;
  v_rows   bigint;
  v_counts bigint;
begin
  if (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, 'default'), ' '
                        order by p.oid::regprocedure::text)
        from pg_proc p
       where p.oid in (to_regprocedure('public.record_post_view(uuid)')::oid,
                       to_regprocedure('public.record_profile_view(uuid,text)')::oid))
     is distinct from current_setting('vibe.views_old_acl', true) then
    bad := bad || ' who may call the old pair changed;';
  end if;

  foreach f in array array[to_regprocedure('public.record_post_view(uuid)'),
                           to_regprocedure('public.record_profile_view(uuid,text)')] loop
    foreach api in array array['anon', 'authenticated', 'service_role'] loop
      if not has_function_privilege(api, f, 'execute') then
        bad := bad || format(' %s is refused to %s (the standing rule);', f, api);
      end if;
    end loop;
    if not exists (select 1 from pg_proc p
                    where p.oid = f and p.prosecdef and p.proconfig = array['search_path=public']) then
      bad := bad || format(' %s is not security definer with search_path public;', f);
    end if;
    select btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      into src from pg_proc p where p.oid = f;
    if src is distinct from 'begin return false; end;' then
      bad := bad || format(' %s is not emptied: %s;', f, src);
    end if;
  end loop;

  -- A signed-in caller with a real id (the case that used to count), anon
  -- and this role: false each time, and no row and no counter moved. The
  -- signed-in probe is undone by its raise (the role and the claims).
  -- Only the probe's own rows and counters are compared: the new pair is
  -- counting real views while this runs, and each statement here reads a
  -- fresh snapshot, so a whole-table sum could move under it.
  select u.id into v_user from public.users u order by u.created_at limit 1;
  select u.id into v_other from public.users u where u.id <> v_user order by u.created_at limit 1;
  select p.id into v_post from public.posts p where p.user_id <> v_user and p.removed_at is null limit 1;
  select (select count(*) from public.post_views where post_id = v_post and user_id = v_user)
       + (select count(*) from public.profile_views where profile_user_id = v_other and viewer_user_id = v_user),
         (select coalesce(sum(view_count), 0) from public.posts where id = v_post)
       + (select coalesce(sum(profile_view_count), 0) from public.users where id = v_other)
    into v_rows, v_counts;
  foreach api in array array['authenticated', 'anon'] loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', api)::text, true);
      execute format('set local role %I', api);
      if public.record_post_view(v_post) or public.record_profile_view(v_other, null) then
        bad := bad || format(' the old pair counted for %s;', api);
      end if;
      raise exception 'views-old: probe undone';
    exception when raise_exception then
      null;
    end;
  end loop;
  if public.record_post_view(v_post) or public.record_profile_view(v_other, null) then
    bad := bad || format(' the old pair counted for %s;', current_user);
  end if;
  if (select count(*) from public.post_views where post_id = v_post and user_id = v_user)
       + (select count(*) from public.profile_views where profile_user_id = v_other and viewer_user_id = v_user) <> v_rows
     or (select coalesce(sum(view_count), 0) from public.posts where id = v_post)
       + (select coalesce(sum(profile_view_count), 0) from public.users where id = v_other) <> v_counts then
    bad := bad || ' the probe wrote a view row or moved its counter;';
  end if;

  if bad <> '' then
    raise exception 'views-old post-check failed:%', bad;
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
