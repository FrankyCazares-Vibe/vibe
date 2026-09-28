-- Who viewed your profile is read on the server only (S67 security wave 2,
-- batch A3; security report 2026-09-27 finding #17, "The Vibe+ 'who viewed
-- your profile' list can be read for free straight from the database").
--
-- WHY THIS EXISTS. profile_views_owner_select (20260513000000) lets any
-- signed-in student read their own profile_views rows over PostgREST with the
-- anon key their browser already holds:
--   GET /rest/v1/profile_views?select=viewer_user_id,viewed_on,referrer
-- then resolve the ids to names. That is the whole paid "Who viewed you" list
-- for free, with no 90-day window and no block/mute filter. Billing is off
-- today (1 entitlement row), so the harm now is that viewers are named to
-- anyone who looks; the day Vibe+ turns on, it is the paid line given away.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT, aborting on any drift from LIVE STATE below.
--   2. DROP POLICY profile_views_owner_select ON public.profile_views.
--   3. REVOKE ALL ON public.profile_views FROM anon, authenticated.
--   4. POST-CHECK by catalog inside the transaction; any miss aborts the file.
--   5. notify pgrst, 'reload schema'.
--
-- WHY DROP + REVOKE, AND NOT THE REPORT'S COLUMN REVOKE. anon and
-- authenticated hold TABLE-level arwdDxtm on profile_views (Supabase's default
-- ACL), so `REVOKE SELECT (viewer_user_id, referrer)` removes a column entry
-- that does not exist and changes nothing (the trap 20260927141000 writes up).
-- Dropping the policy alone would make a client read come back [] with no
-- error, which a screen paints as "nobody looked". Revoking the grant as well
-- makes any stray client read fail loudly (42501), which the routes turn into a
-- 500: a refused read never paints a 0. ALL, not only SELECT/INSERT/UPDATE/
-- DELETE: nothing but record_profile_view (SECURITY DEFINER) touches the table,
-- and TRUNCATE ignores RLS, so no client role has a reason to keep any of it.
-- RLS stays ENABLED with zero policies (the post_views shape), so a future
-- stray grant would still read nothing.
--
-- WHO STILL READS AND WRITES (grep of src/, public/html/, mobile/, 2026-09-27)
--   * WRITE: POST /api/profile-views -> rpc record_profile_view(uuid,text),
--     SECURITY DEFINER, owner postgres (the table owner, BYPASSRLS). The only
--     database object that names profile_views (prosrc scan; no view, rule,
--     trigger, policy, publication or incoming FK does). Unaffected.
--   * READ: GET /api/me/profile-views (the free Today / 7 days / 30 days tiles
--     and the free locked_count, plus the Vibe+ `recent` first page) and
--     GET /api/me/profile-viewers (Vibe+ "Show more", after requirePlus), the
--     list through src/lib/metrics/profile-viewers.ts. Until this wave they
--     read with the COOKIE client under this policy. The wave-A code reads with
--     the SERVICE ROLE (BYPASSRLS, keeps its grant), scoped by hand to the
--     auth.getUser() id. SHIP THAT CODE FIRST (see DEPLOY ORDER).
--   * No client file (public/html, mobile/, components) reads the table.
--
-- DOES NOT: touch record_profile_view, users.profile_view_count, post_views
-- (already RLS on with zero policies), bookmarks, or any row. No data changes,
-- so no _cleanup.sql. Nothing is revoked from service_role or postgres, and no
-- function EXECUTE is revoked (standing rule).
--
-- LIVE STATE (read-only MCP, 2026-09-27, prod at 24dac9f, latest recorded
-- migration 20260927142000, PostgreSQL 17.6):
--   * public.profile_views: owner postgres; RLS enabled, not forced; relacl
--     {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm,
--     service_role=arwdDxtm}; no column ACLs.
--   * Exactly one policy: profile_views_owner_select, PERMISSIVE, FOR SELECT
--     TO authenticated USING (auth.uid() = profile_user_id).
--   * record_profile_view(uuid,text): SECURITY DEFINER, owner postgres,
--     search_path=public, EXECUTE to anon/authenticated/service_role.
--   * service_role and postgres have BYPASSRLS; anon and authenticated do not.
--   * post_views: RLS on, 0 policies.
--   * 43 profile_views rows across 14 profile owners; 1 entitlements row.
--   The local database matches (1 row, same policy, same ACL).
--
-- DEPLOY ORDER: AFTER the deploy. Push the wave-A code, wait for Vercel
-- READY, confirm the served build is the new one (S65 stale-cache lesson),
-- THEN apply this file. The new code reads the ledger with the service role, so
-- it works the same with or without the policy. The code on main before this
-- wave reads it with the cookie client: applied first, every Otto metrics open
-- 500s ("Couldn't load your metrics") until the deploy lands.
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260928140000', 'profile_views_server_only');
--
-- CHECK AFTER APPLYING (read-only):
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'profile_views';              -- 0
--   SELECT has_table_privilege('authenticated', 'public.profile_views', 'SELECT'); -- f
--   SELECT has_table_privilege('service_role', 'public.profile_views', 'SELECT');  -- t
--   Then, signed in as a student: Otto metrics shows the same tiles as
--   before; GET /rest/v1/profile_views?select=viewer_user_id with the anon key
--   and that session answers "permission denied for table profile_views";
--   opening someone else's profile still bumps their tiles.
--
-- ROLLBACK (gives the free viewer list back; only if something breaks; the
-- wave-A code keeps working either way):
--   BEGIN;
--   GRANT ALL ON public.profile_views TO anon, authenticated;
--   CREATE POLICY "profile_views_owner_select"
--     ON public.profile_views FOR SELECT TO authenticated
--     USING (auth.uid() = profile_user_id);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928140000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- DROP POLICY and REVOKE lock profile_views until COMMIT, and every profile
-- visit (record_profile_view) waits behind that. Fail fast instead of queueing.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT: abort on any drift from LIVE STATE ---------------------------
do $$
declare
  n   int;
  bad text;
  pol record;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.profile_views'::regclass) then
    raise exception 'profile-views: RLS is off on profile_views; stop and re-read before changing its guards';
  end if;
  -- record_profile_view runs as the table owner, which skips RLS only while
  -- RLS is not FORCED. With no policy left, a forced table would refuse it.
  if (select relforcerowsecurity from pg_class where oid = 'public.profile_views'::regclass) then
    raise exception 'profile-views: RLS is FORCED; record_profile_view would lose its writes with no policy';
  end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid = 'public.profile_views'::regclass) <> 'postgres' then
    raise exception 'profile-views: profile_views is no longer owned by postgres';
  end if;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'profile_views';
  if n <> 1 then
    raise exception 'profile-views: expected exactly 1 policy on profile_views, found %', n;
  end if;
  select * into pol from pg_policies where schemaname = 'public' and tablename = 'profile_views';
  if pol.policyname <> 'profile_views_owner_select'
     or pol.cmd <> 'SELECT'
     or pol.permissive <> 'PERMISSIVE'
     or pol.roles <> '{authenticated}'::name[]
     or pol.qual is distinct from '(auth.uid() = profile_user_id)'
     or pol.with_check is not null then
    raise exception 'profile-views: the policy drifted: % % % % qual=% check=%',
      pol.policyname, pol.cmd, pol.permissive, pol.roles, pol.qual, pol.with_check;
  end if;

  -- The state this file changes.
  if not has_table_privilege('authenticated', 'public.profile_views', 'SELECT')
     or not has_table_privilege('anon', 'public.profile_views', 'SELECT') then
    raise exception 'profile-views: anon/authenticated already lack SELECT on profile_views; re-read the grants';
  end if;
  -- A column grant survives a table-level REVOKE; there must be none to miss.
  select string_agg(attname, ', ') into bad
    from pg_attribute
   where attrelid = 'public.profile_views'::regclass
     and attnum > 0 and not attisdropped and attacl is not null;
  if bad is not null then
    raise exception 'profile-views: column-level grants on % would survive the revoke', bad;
  end if;

  -- The one writer keeps working without the client grants.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'record_profile_view'
     and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres';
  if n <> 1 then
    raise exception 'profile-views: record_profile_view is not one SECURITY DEFINER function owned by postgres';
  end if;

  -- The server reads work only because the service role skips RLS.
  if not (select rolbypassrls from pg_roles where rolname = 'service_role')
     or not has_table_privilege('service_role', 'public.profile_views', 'SELECT') then
    raise exception 'profile-views: service_role cannot read profile_views past RLS; the routes would read nothing';
  end if;

  -- Nothing else in the database reads profile_views as the caller.
  select string_agg(ns.nspname || '.' || p.proname, ', ') into bad
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname not in ('pg_catalog', 'information_schema')
     and p.prosrc ilike '%profile_views%' and not p.prosecdef;
  if bad is not null then
    raise exception 'profile-views: a SECURITY INVOKER function reads profile_views and would break: %', bad;
  end if;
  select string_agg(schemaname || '.' || viewname, ', ') into bad
    from pg_views
   where schemaname not in ('pg_catalog', 'information_schema')
     and definition ilike '%profile_views%';
  if bad is null then
    select string_agg(schemaname || '.' || matviewname, ', ') into bad
      from pg_matviews where definition ilike '%profile_views%';
  end if;
  if bad is not null then
    raise exception 'profile-views: a view reads profile_views and would break: %', bad;
  end if;
  select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where tablename <> 'profile_views'
     and coalesce(qual, '') || ' ' || coalesce(with_check, '') ilike '%profile_views%';
  if bad is not null then
    raise exception 'profile-views: a policy elsewhere reads profile_views as the caller: %', bad;
  end if;

  -- The sibling ledger this file copies the shape of.
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'post_views';
  if n <> 0 then
    raise exception 'profile-views: post_views now has % policies; the header''s model is stale', n;
  end if;
end $$;

-- 1. the change --------------------------------------------------------------
drop policy profile_views_owner_select on public.profile_views;
revoke all on public.profile_views from anon, authenticated;

-- 2. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
declare
  n    int;
  role text;
  priv text;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'profile_views';
  if n <> 0 then
    raise exception 'profile-views: % policies remain on profile_views', n;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profile_views'::regclass) then
    raise exception 'profile-views: RLS went off on profile_views';
  end if;

  foreach role in array array['anon', 'authenticated'] loop
    foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                                'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
      if has_table_privilege(role, 'public.profile_views', priv) then
        raise exception 'profile-views: % still holds % on profile_views', role, priv;
      end if;
    end loop;
    if has_any_column_privilege(role, 'public.profile_views', 'SELECT') then
      raise exception 'profile-views: % can still SELECT a column of profile_views', role;
    end if;
  end loop;

  -- The server side is untouched: the routes' reads and the one writer.
  if not has_table_privilege('service_role', 'public.profile_views', 'SELECT') then
    raise exception 'profile-views: service_role lost SELECT; Otto metrics would 500 for everyone';
  end if;
  if not has_function_privilege('authenticated', 'public.record_profile_view(uuid, text)', 'EXECUTE') then
    raise exception 'profile-views: authenticated lost EXECUTE on record_profile_view; views would stop counting';
  end if;
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'record_profile_view'
     and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres';
  if n <> 1 then
    raise exception 'profile-views: record_profile_view changed under this file';
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
