-- ---------------------------------------------------------------------------
-- 20261008120000_users_last_active_private.sql
--
-- PLAIN ENGLISH
-- Any signed-in account could read roughly when any other account was last
-- active, straight from the database (Privacy Policy 5b admits it:
-- "roughly when it was last active"; page-and-code-changes.md row 23). No
-- screen shows it: the app only ever shows a NUMBER ("12 active now"). After
-- this file the number still works and the times cannot be read.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: authenticated holds column SELECT on users.last_active_at
--      and no table-level SELECT on users (column grants are the boundary,
--      20260923090000); the function below does not exist yet.
--   2. public.users_active_count(p_campus_ids text[]): how many accounts the
--      CALLER may see (the users_select_authenticated rule: themselves, or
--      user_visible) were active in the last 5 minutes, in everyone (null)
--      or in the listed campuses. SECURITY DEFINER, returns one number. The
--      window is fixed inside the function: a caller cannot move it to work
--      out one person's time.
--   3. revoke select (last_active_at) on public.users from authenticated.
--      UPDATE stays: POST /api/me/heartbeat writes the viewer's own row with
--      their own client, and its WHERE reads only `id`.
--   4. POST-CHECK, then notify pgrst.
--
-- DOES NOT: touch anon (it holds nothing on users), the service role, or
-- who can read any other column.
--
-- LIVE STATE: NOT READ for this file. Before applying, read on production
-- (settings, allowed by the counts-only rule):
--   SELECT has_column_privilege('authenticated','public.users','last_active_at','SELECT') AS col_select,
--          has_column_privilege('authenticated','public.users','last_active_at','UPDATE') AS col_update,
--          has_table_privilege('authenticated','public.users','SELECT')                    AS table_select,
--          to_regprocedure('public.users_active_count(text[])') IS NULL                    AS fn_absent;
--   -- expect t, t, f, t (the local database, 2026-10-08).
--
-- DEPLOY ORDER. CODE FIRST. GET /api/stats/campus on main asks the function
-- and, while it is missing, counts the old way. Applying this file before
-- that code is live breaks the "active now" number (permission denied).
--
-- THE SAME DAY: cut "roughly when it was last active" from Privacy Policy 5b
-- (page-and-code-changes.md row 23).
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261008120000', 'users_last_active_private');
--
-- ROLLBACK:
--   BEGIN;
--   GRANT SELECT (last_active_at) ON public.users TO authenticated;
--   DROP FUNCTION public.users_active_count(text[]);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
begin
  if not has_column_privilege('authenticated', 'public.users', 'last_active_at', 'SELECT') then
    raise exception 'last-active: authenticated cannot read users.last_active_at (applied already?)';
  end if;
  if has_table_privilege('authenticated', 'public.users', 'SELECT') then
    raise exception 'last-active: authenticated holds table-level SELECT on users; a column revoke would do nothing';
  end if;
  if to_regprocedure('public.users_active_count(text[])') is not null then
    raise exception 'last-active: public.users_active_count(text[]) already exists';
  end if;
end $$;

-- 1. the count ---------------------------------------------------------------
-- The same rows the caller's own `select count` saw before the revoke:
-- users_select_authenticated is (id = auth.uid() OR user_visible(id)).
-- 5 minutes = ACTIVE_WINDOW_MS in src/app/api/stats/campus/route.ts.
create function public.users_active_count(p_campus_ids text[] default null)
  returns bigint
  language sql
  stable
  security definer
  set search_path = public
as $$
  select count(*)
    from public.users u
   where u.last_active_at >= now() - interval '5 minutes'
     and (p_campus_ids is null or u.campus_id = any (p_campus_ids))
     and (u.id = (select auth.uid()) or public.user_visible(u.id));
$$;

comment on function public.users_active_count(text[]) is
  'How many accounts the caller may see were active in the last 5 minutes, everywhere (null) or in the listed campuses. The window is fixed here on purpose. For GET /api/stats/campus (20261008120000).';

revoke execute on function public.users_active_count(text[]) from public, anon;
grant  execute on function public.users_active_count(text[]) to authenticated, service_role;

-- 2. the times themselves ----------------------------------------------------
revoke select (last_active_at) on public.users from authenticated;

-- 3. POST-CHECK inside the transaction ---------------------------------------
do $$
begin
  if has_column_privilege('authenticated', 'public.users', 'last_active_at', 'SELECT') then
    raise exception 'last-active: authenticated can still read users.last_active_at';
  end if;
  if not has_column_privilege('authenticated', 'public.users', 'last_active_at', 'UPDATE') then
    raise exception 'last-active: the revoke took UPDATE too; the heartbeat needs it';
  end if;
  if not has_column_privilege('authenticated', 'public.users', 'id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.users', 'campus_id', 'SELECT') then
    raise exception 'last-active: the revoke was wider than one column';
  end if;
  if has_function_privilege('anon', 'public.users_active_count(text[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.users_active_count(text[])', 'EXECUTE') then
    raise exception 'last-active: users_active_count grants are not as written';
  end if;
end $$;

-- 4. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
