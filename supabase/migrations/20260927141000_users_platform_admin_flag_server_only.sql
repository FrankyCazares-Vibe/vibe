-- Hide who the admins are (S67 security wave, batch d; security report
-- 2026-09-27 finding #38, "Any signed-in user can list the admin accounts",
-- and part of #12).
--
-- WHY THIS EXISTS. 20260903100000 granted `authenticated` SELECT on
-- users.is_platform_admin as part of the public profile surface. The anon key
-- ships to every browser, so any signed-in student could ask PostgREST for
-- /rest/v1/users?select=handle,name&is_platform_admin=eq.true and get the
-- three founder accounts that can ban students, read every report and look up
-- anyone's email address: a ready-made phishing list. Nothing a student sees
-- needs anyone else's flag.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT, aborting on any surprise: authenticated holds SELECT on the
--      column as a COLUMN grant and has no table-wide SELECT on users (a
--      table grant would make the column revoke a no-op); anon cannot read
--      it; no RLS policy and no view names the column; every function that
--      reads it is SECURITY DEFINER (runs as its owner, so the revoke cannot
--      break it). Today that is exactly public.org_content_visible, which
--      posts_select_authenticated and record_post_view call.
--   2. REVOKE SELECT (is_platform_admin) ON public.users FROM authenticated.
--   3. POST-CHECK inside the transaction: authenticated can no longer read the
--      column, still reads an ordinary public column (handle), and the service
--      role still reads the flag.
--   4. notify pgrst, 'reload schema'.
--
-- WHO STILL READS THE FLAG (grep is_platform_admin, 2026-09-27). Every read
-- in the app uses the SERVICE role:
--   * src/lib/auth/require-platform-admin.ts (requirePlatformAdmin and
--     requirePlatformAdminPage), src/app/the-map/page.tsx,
--     src/lib/orgs/hidden-org-access.ts, src/lib/orgs/membership.ts,
--     src/app/api/feed/route.ts, src/app/api/orgs/[slug]/members/route.ts,
--     src/app/api/admin/users/[id]/route.ts and .../restrict/route.ts,
--     src/lib/moderation/alerts.ts: each filtered to the caller's own id or
--     behind the admin gate.
--   * GET /api/me/profile-bootstrap returns the caller's OWN flag to the
--     LeftNav's Admin link. It read it through the cookie client until this
--     wave; it now reads it with the service role scoped to the caller's id.
--     SHIP THAT CODE FIRST (see DEPLOY ORDER).
--   * public/html and mobile/ never name the column.
--
-- LIVE STATE (read-only MCP, 2026-09-27, at c72aaa2):
--   * public.users relacl {postgres=arwdDxtm, authenticated=dDxtm,
--     service_role=arwdDxtm}: no table-wide SELECT for authenticated.
--   * is_platform_admin column ACL {authenticated=r/postgres}; anon none.
--   * 3 users have the flag. No policy or view names it; the only function
--     that does is public.org_content_visible (SECURITY DEFINER).
--   * Latest recorded schema_migrations version: 20260927100000.
--
-- DEPLOY ORDER. Code first, then this file. The code on main before this wave
-- reads the flag through the cookie client in profile-bootstrap; applied
-- first, the founders lose the Admin link in the left nav (the read comes back
-- empty and the route treats that as "not an admin") until the deploy lands.
-- The admin gates themselves are unaffected either way (service role).
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260927141000', 'users_platform_admin_flag_server_only');
--
-- POST-CHECK (read-only, after applying):
--   SELECT has_column_privilege('authenticated','public.users','is_platform_admin','SELECT'); -- f
--   SELECT has_column_privilege('service_role','public.users','is_platform_admin','SELECT');  -- t
--   Then, signed in as a founder, the left nav still shows Admin and /admin
--   opens; signed in as a student, GET /rest/v1/users?select=is_platform_admin
--   with the anon key and that session answers 401 "permission denied".
--
-- ROLLBACK (puts the phishing list back; only if something breaks):
--   BEGIN;
--   GRANT SELECT (is_platform_admin) ON public.users TO authenticated;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927141000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- REVOKE takes a lock on users until COMMIT; every profile read waits behind
-- it. Fail fast instead of queueing the whole app.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  bad text;
begin
  if has_table_privilege('authenticated', 'public.users', 'SELECT') then
    raise exception 'admin-flag: authenticated has table-wide SELECT on users; a column revoke would change nothing';
  end if;
  if not has_column_privilege('authenticated', 'public.users', 'is_platform_admin', 'SELECT') then
    raise exception 'admin-flag: authenticated already cannot read is_platform_admin; stop and re-read the grants';
  end if;
  if has_column_privilege('anon', 'public.users', 'is_platform_admin', 'SELECT') then
    raise exception 'admin-flag: anon can read is_platform_admin; this file does not expect that';
  end if;

  select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where coalesce(qual, '') || ' ' || coalesce(with_check, '') ilike '%is_platform_admin%';
  if bad is not null then
    raise exception 'admin-flag: a policy reads is_platform_admin as the caller and would break: %', bad;
  end if;

  select string_agg(schemaname || '.' || viewname, ', ') into bad
    from pg_views
   where schemaname not in ('pg_catalog', 'information_schema')
     and definition ilike '%is_platform_admin%';
  if bad is not null then
    raise exception 'admin-flag: a view reads is_platform_admin and would break: %', bad;
  end if;

  select string_agg(n.nspname || '.' || p.proname, ', ') into bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and p.prosrc ilike '%is_platform_admin%'
     and not p.prosecdef;
  if bad is not null then
    raise exception 'admin-flag: a SECURITY INVOKER function reads is_platform_admin and would break: %', bad;
  end if;
end $$;

-- 1. the revoke --------------------------------------------------------------
revoke select (is_platform_admin) on public.users from authenticated;

-- 2. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
begin
  if has_column_privilege('authenticated', 'public.users', 'is_platform_admin', 'SELECT') then
    raise exception 'admin-flag: authenticated can still read is_platform_admin';
  end if;
  if not has_column_privilege('authenticated', 'public.users', 'handle', 'SELECT') then
    raise exception 'admin-flag: authenticated lost the public profile columns (handle)';
  end if;
  if not has_column_privilege('service_role', 'public.users', 'is_platform_admin', 'SELECT') then
    raise exception 'admin-flag: service_role lost the flag; every admin gate would fail closed';
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
