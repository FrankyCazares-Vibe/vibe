-- Hidden profile widgets really hidden: bio, skills, experience and
-- "working on" leave the direct data API (S67 security wave 2, batch A1;
-- security report 2026-09-27 finding #3, product call 1 in
-- handoffs/wave-plan-sec2/waveA-build.md).
--
-- WHY THIS EXISTS. A student can hide a profile widget, and both surfaces
-- promise "hidden · only you see it" (ProfileMobile.tsx, profile.html). This
-- wave makes the ROUTES keep that promise: the public bootstrap blanks a
-- hidden widget's fields for every non-owner (lib/profile/hidden-fields.ts),
-- and /api/resume refuses a hidden résumé. But `authenticated` could still
-- read users.bio / skills / work_experience / current_on straight from
-- PostgREST with the anon key and any session
-- (/rest/v1/users?select=handle,bio,skills,work_experience,current_on), so a
-- hidden bio or work history was one request away for every signed-in
-- account, school-verified or not. After this file those four columns reach
-- other people ONLY through the profile routes, which read them with the
-- service role and apply the layout. The owner's own reads (me/profile,
-- me/profile-sync, me/profile-bootstrap) already use the service role.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT, aborting on any drift from LIVE STATE below: users grants
--      are column-level (no table-wide SELECT for authenticated or anon, or a
--      column revoke would be a no-op); authenticated holds SELECT on the four
--      columns; anon holds none; the résumé / layout columns are already not
--      readable by authenticated; no RLS policy, no view and no SECURITY
--      INVOKER function names any of the four (a SECURITY DEFINER one runs as
--      its owner and is unaffected; today there are none at all).
--   2. REVOKE SELECT (bio, skills, work_experience, current_on) ON public.users
--      FROM authenticated, anon, public. (anon and public hold nothing today;
--      naming them keeps a later broad grant from quietly undoing this.)
--   3. POST-CHECK inside the transaction, by catalog AND by behaviour: the
--      four are unreadable for authenticated, every column the app's
--      cookie-client users embeds use is still readable, the service role
--      still reads the four, and, as `set local role authenticated`, a select
--      of each of the four raises 42501 while id/handle/name/avatar_url/school
--      still selects.
--   4. notify pgrst, 'reload schema'.
--
-- DOES NOT
--   * touch UPDATE: authenticated keeps column UPDATE on current_on (and on
--     resume_url, resume_docs, resume_redactions, work_order_manual, year,
--     ...). Nothing in the app writes those with the cookie client; a direct
--     write skips the profile word filter. Follow-up batch, not this one.
--   * touch any policy, profile_layout (already service-role only), or any
--     row. No data change, so no _cleanup file.
--   * hide anything from the OWNER: the owner's routes use the service role.
--
-- WHO STILL READ THE FOUR WITH THE COOKIE CLIENT (grep, 2026-09-27):
--   * GET /api/me/threads: the inbox member embed named `bio` (DM subtitle
--     fallback). Batch A2 drops it (product call 2: school, else blank).
--   * POST /api/me/reports type=user: the snapshot spec named `bio`. Batch A2
--     reads bio with the service role instead.
--   Nothing else in src/, mobile/ or public/html names them on a cookie
--   client; public/html makes no direct PostgREST calls.
--
-- LIVE STATE (read-only MCP, 2026-09-27, production at 24dac9f):
--   * public.users relacl {postgres=arwdDxtm, authenticated=dDxtm,
--     service_role=arwdDxtm}: no table-wide SELECT for authenticated or anon.
--   * attacl: bio, skills, work_experience {authenticated=r/postgres};
--     current_on {authenticated=rw/postgres}; profile_layout none;
--     resume_url, resume_docs, resume_redactions {authenticated=w/postgres}.
--     anon has SELECT on no users column.
--   * No function, view or policy body names bio|skills|work_experience|
--     current_on (word-boundary scan of pg_proc.prosrc, pg_views, pg_policies).
--   * 20 users; 1 hides widgets (résumé, skills, experience); 0 hide bio or
--     working-on; 4 hold a résumé; 6 are not school-verified.
--   * Latest recorded schema_migrations version: 20260927142000.
--
-- DEPLOY ORDER. AFTER the deploy, and after batch A2's changes to
-- src/app/api/me/threads/route.ts and src/app/api/me/reports/route.ts are
-- the SERVED build (check the served JS, not just git: S65 stale-cache
-- lesson). Applied first, every inbox load (GET /api/me/threads) and every
-- user report (POST /api/me/reports, type=user) answers 500 on 42501 until
-- the new code is live. The A1 code itself is safe under both grant states.
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260928160000', 'users_profile_widgets_server_only');
--
-- POST-CHECK (read-only, after applying):
--   SELECT c, has_column_privilege('authenticated','public.users',c,'SELECT')
--     FROM unnest(array['bio','skills','work_experience','current_on']) c;  -- all f
--   SELECT has_column_privilege('authenticated','public.users','handle','SELECT'); -- t
--   Then, signed in as a student: the inbox loads, reporting a user works, a
--   visited profile still shows its (non-hidden) bio / skills / experience.
--
-- ROLLBACK (puts the direct read back; only if something breaks):
--   BEGIN;
--   GRANT SELECT (bio, skills, work_experience, current_on) ON public.users TO authenticated;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928160000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- REVOKE locks users until COMMIT; every profile read waits behind it. Fail
-- fast instead of queueing the whole app.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  c text;
  bad text;
  cols constant text[] := array['bio', 'skills', 'work_experience', 'current_on'];
  words constant text := '\m(bio|skills|work_experience|current_on)\M';
begin
  if has_table_privilege('authenticated', 'public.users', 'SELECT')
     or has_table_privilege('anon', 'public.users', 'SELECT') then
    raise exception 'users-widgets: a table-wide SELECT on users exists; a column revoke would change nothing';
  end if;
  foreach c in array cols loop
    if not has_column_privilege('authenticated', 'public.users', c, 'SELECT') then
      raise exception 'users-widgets: authenticated already cannot read users.%; stop and re-read the grants', c;
    end if;
    if has_column_privilege('anon', 'public.users', c, 'SELECT') then
      raise exception 'users-widgets: anon can read users.%; this file does not expect that', c;
    end if;
  end loop;
  foreach c in array array['profile_layout', 'resume_url', 'resume_docs', 'resume_redactions'] loop
    if has_column_privilege('authenticated', 'public.users', c, 'SELECT') then
      raise exception 'users-widgets: authenticated can read users.% (expected service-role only); re-read LIVE STATE', c;
    end if;
  end loop;

  select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* words;
  if bad is not null then
    raise exception 'users-widgets: a policy names one of the four columns and would break: %', bad;
  end if;

  select string_agg(schemaname || '.' || viewname, ', ') into bad
    from pg_views
   where schemaname not in ('pg_catalog', 'information_schema')
     and definition ~* words;
  if bad is not null then
    raise exception 'users-widgets: a view names one of the four columns and would break: %', bad;
  end if;

  select string_agg(n.nspname || '.' || p.proname, ', ') into bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and p.prosrc ~* words
     and not p.prosecdef;
  if bad is not null then
    raise exception 'users-widgets: a SECURITY INVOKER function names one of the four columns and would break: %', bad;
  end if;
end $$;

-- 1. the revoke --------------------------------------------------------------
revoke select (bio, skills, work_experience, current_on) on public.users from authenticated, anon, public;

-- 2. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
declare
  c text;
  cols constant text[] := array['bio', 'skills', 'work_experience', 'current_on'];
begin
  -- Catalog.
  foreach c in array cols loop
    if has_column_privilege('authenticated', 'public.users', c, 'SELECT')
       or has_column_privilege('anon', 'public.users', c, 'SELECT') then
      raise exception 'users-widgets: users.% is still readable through the data API', c;
    end if;
    if not has_column_privilege('service_role', 'public.users', c, 'SELECT') then
      raise exception 'users-widgets: service_role lost users.%; every profile route would break', c;
    end if;
  end loop;
  -- Every column a cookie-client users read or embed in src/ still uses.
  foreach c in array array['id', 'name', 'handle', 'avatar_url', 'school', 'major', 'year',
                           'tagline', 'campus_id', 'school_system', 'school_verified'] loop
    if not has_column_privilege('authenticated', 'public.users', c, 'SELECT') then
      raise exception 'users-widgets: authenticated lost users.%, which the app still embeds', c;
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.users', 'current_on', 'UPDATE') then
    raise exception 'users-widgets: the UPDATE grant on current_on moved; this file must not touch it';
  end if;

  -- Behaviour, as the role PostgREST uses for a signed-in student.
  execute 'set local role authenticated';
  foreach c in array cols loop
    begin
      execute format('select %I from public.users limit 1', c);
      raise exception 'users-widgets: authenticated can still select users.%', c;
    exception when insufficient_privilege then
      null; -- 42501, as intended
    end;
  end loop;
  perform id, handle, name, avatar_url, school from public.users limit 1;
  execute 'reset role';
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
