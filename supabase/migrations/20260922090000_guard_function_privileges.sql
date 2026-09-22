-- EMERGENCY (found 2026-09-22 on the local stack): calling a public function
-- that the caller has no EXECUTE on crashes the Postgres backend.
--
-- WHAT WAS SEEN, local stack only (image public.ecr.aws/supabase/postgres
-- 17.6.1.111, the same version, preload list and supautils settings as the
-- hosted project):
--   * `set local role anon; select public.rate_limit_hit('p',1,1)` and the
--     same for is_org_dormant, and as `authenticated` for rate_limit_hit:
--     "server process ... was terminated by signal 11: Segmentation fault",
--     then crash recovery — every connection on the database drops.
--   * The same through the public REST API with only the anon key:
--     POST /rest/v1/rpc/rate_limit_hit -> 503 "no connection to the server",
--     three calls, three crashes.
--   * NOT crashing: a table permission error (it gets the supautils
--     "Grant the required privileges" hint), divide by zero, an ordinary
--     RAISE, and a RAISE with errcode 42501 from INSIDE a function the caller
--     may execute. Trigger functions are not reachable over REST (PGRST202).
-- So the crash is the function EXECUTE permission check itself, for any role.
-- The hosted project has not crashed (postmaster, checkpointer and
-- bgwriter all started 2026-09-02; no crash lines in postgres_logs), so
-- nobody has triggered it — but the anon key ships in the site bundle, and
-- 11 public functions are in exactly the crashing state today.
--
-- WHAT THIS FILE DOES: removes the permission-denied path for every
-- REST-reachable public function, without widening what anyone learns.
--   1. Pre-check: each function's definition must be the one read from
--      production on 2026-09-22 (md5 of pg_get_functiondef). Any other body
--      aborts the whole file, so nothing unexpected is overwritten.
--   2. Six helpers that answer a question about ARBITRARY people or clubs
--      (is_org_member, org_member_role, can_view_org_channel,
--      is_org_dormant, is_blocked_either_way, is_muting_now) return false /
--      null for the `anon` role. Their bodies are otherwise the production
--      bodies verbatim, so every RLS policy that calls them (always as
--      `authenticated` or above) behaves exactly as today. is_muting_now is
--      written from PRODUCTION's body, which also converges the local stack
--      (its migration-file body had drifted).
--   3. rate_limit_hit refuses anon and authenticated with errcode 42501 from
--      inside the function, before touching rate_limits — otherwise any
--      visitor could bump a key such as `school-email:<someone's id>` and
--      lock that person out. The service role (the only real caller, via
--      src/lib/rate-limit.ts) is unaffected.
--   4. has_recorded_consent, is_channel_member, record_post_view and
--      record_profile_view already answer false when auth.uid() is null, so
--      they only need the grant.
--   5. GRANT EXECUTE on all eleven to anon (rate_limit_hit to authenticated
--      too). After this no REST-reachable public function denies EXECUTE.
--
-- RULE FOR EVERY FUTURE MIGRATION (until Supabase fixes the image): never
-- leave a public, non-trigger function without EXECUTE for anon or
-- authenticated. Grant it and refuse inside (return false/null, or RAISE
-- ... USING ERRCODE = '42501'). A revoke is a crash button.
--
-- PRE-CHECK (read-only): the 11 md5s below match production (checked
-- 2026-09-22); `select max(version) from supabase_migrations.schema_migrations`
-- = 20260916130000 (nothing after it applied yet).
--
-- APPLY: management API (the MCP execute_sql is read-only), then record
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260922090000', 'guard_function_privileges');
--
-- POST-CHECK (read-only):
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
--      and format_type(p.prorettype, null) not in ('trigger','event_trigger')
--      and (not has_function_privilege('anon', p.oid, 'EXECUTE')
--           or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- expect 0 rows
--
-- ROLLBACK (re-opens the crash, so only with a replacement ready): restore
-- the eleven production bodies from this file's pre-check source and
--   REVOKE EXECUTE ON FUNCTION <each> FROM anon;
--   REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM authenticated;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922090000';
-- ---------------------------------------------------------------------------

begin;
set local lock_timeout = '5s';

-- 1. The bodies must be the production bodies read on 2026-09-22.
do $$
declare
  expected jsonb := jsonb_build_object(
    'can_view_org_channel',  jsonb_build_array('f2f1d75df21e0010944da62a06aa540d'),
    'has_recorded_consent',  jsonb_build_array('8223fecfa861950ea95538e53f0cbf31'),
    'is_blocked_either_way', jsonb_build_array('3a6f6bab2ab38383ac540793300c0365'),
    'is_channel_member',     jsonb_build_array('c1928ee32f5438a321acf5faad728710'),
    -- production, and the drifted migration-file body the local stack builds
    'is_muting_now',         jsonb_build_array('c03a7cd63572d5be72f1ce6bb220754d', 'c4e594d03d321f3b60d3a4cc9d0a4329'),
    'is_org_dormant',        jsonb_build_array('e74b46ea03223768216d8151ae2e0376'),
    'is_org_member',         jsonb_build_array('a098e653a261f33803dab967ebcacdf9'),
    'org_member_role',       jsonb_build_array('c29593e98cf1cd1ebfd8e2972e2d1e77'),
    'rate_limit_hit',        jsonb_build_array('10b8329118785b671f6c81d7018d7383'),
    'record_post_view',      jsonb_build_array('8370ec8c65d2930bd4140dace32dc8e4'),
    'record_profile_view',   jsonb_build_array('6886c19e17de2e122f39bcc8274c87c9'));
  r record;
  n int := 0;
begin
  for r in
    select p.proname, md5(pg_get_functiondef(p.oid)) as h
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.proname in (select jsonb_object_keys(expected))
  loop
    n := n + 1;
    if not (expected -> r.proname) ? r.h then
      raise exception 'guard_function_privileges: % has an unexpected body (md5 %); stop and re-read it', r.proname, r.h;
    end if;
  end loop;
  if n <> 11 then
    raise exception 'guard_function_privileges: expected 11 functions, found %', n;
  end if;
end $$;

-- 2. Helpers about arbitrary people or clubs: false / null for anon,
--    otherwise the production body verbatim.
CREATE OR REPLACE FUNCTION public.is_org_member(oid uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN current_setting('role', true) = 'anon' THEN false ELSE EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = oid AND user_id = uid
  ) END;
$function$;

CREATE OR REPLACE FUNCTION public.org_member_role(oid uuid, uid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.org_members
  WHERE org_id = oid AND user_id = uid
    AND current_setting('role', true) IS DISTINCT FROM 'anon';
$function$;

CREATE OR REPLACE FUNCTION public.can_view_org_channel(cid uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN c.org_id IS NULL THEN false
    WHEN NOT public.is_org_member (c.org_id, uid) THEN false
    WHEN c.is_private = false THEN true
    WHEN public.org_member_role (c.org_id, uid) IN ('owner','admin') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.org_channel_members ocm
      WHERE ocm.channel_id = cid AND ocm.user_id = uid
    )
  END
  FROM public.channels c
  WHERE c.id = cid;
$function$;

CREATE OR REPLACE FUNCTION public.is_org_dormant(oid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT verified = false
     AND (last_activity_at IS NULL OR last_activity_at < now() - interval '60 days')
    FROM public.orgs WHERE id = oid
     AND current_setting('role', true) IS DISTINCT FROM 'anon';
$function$;

CREATE OR REPLACE FUNCTION public.is_blocked_either_way(viewer_id uuid, other_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN current_setting('role', true) = 'anon' THEN false ELSE EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = viewer_id AND blocked_id = other_id)
       OR (blocker_id = other_id AND blocked_id = viewer_id)
  ) END;
$function$;

-- Production's body (the migration-file body had drifted), plus the guard.
CREATE OR REPLACE FUNCTION public.is_muting_now(viewer_id uuid, other_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN current_setting('role', true) = 'anon' THEN false ELSE EXISTS (
    SELECT 1 FROM public.mutes
    WHERE muter_id = viewer_id AND muted_id = other_id
      AND (until IS NULL OR until > now ())
  ) END;
$function$;

-- 3. rate_limit_hit: service role only, refused from inside the function.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window timestamptz;
  v_count  integer;
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN true;
  END IF;
  v_window := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  -- Opportunistic cleanup so the table never grows unbounded.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN v_count <= p_limit;
END;
$function$;

-- 5. No REST-reachable public function denies EXECUTE any more.
GRANT EXECUTE ON FUNCTION public.can_view_org_channel(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_recorded_consent() TO anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_either_way(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_muting_now(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_org_dormant(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.org_member_role(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_post_view(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.record_profile_view(uuid, text) TO anon;

do $$
declare n int;
begin
  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then
    raise exception 'guard_function_privileges: % public functions still deny EXECUTE', n;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
