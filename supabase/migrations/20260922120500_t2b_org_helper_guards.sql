-- T2 FILE 2 OF 2 -- the three org helpers answer only about the caller
-- (week-1 wave plan, handoffs/wave-plan-week1/T2.md §C3, split into its own
-- file with its own rollback by rulings M5; the 2026-09-22 STANDING RULE).
--
-- WHY. is_org_member(oid, uid), org_member_role(oid, uid) and
-- can_view_org_channel(cid, uid) are SECURITY DEFINER and callable over
-- /rest/v1/rpc by any signed-in student, and today they answer about ANY uid:
--   * "is student X in invite-only or hidden club Y?"
--   * "what is X's role in Y?"
--   * "can X read private channel Z?"
-- org_members_select deliberately hides exactly those answers from
-- non-members. (Since 20260922090000 they answer false / null to anon.)
--
-- WHAT IT DOES. Each helper keeps EXECUTE for anon, authenticated and
-- service_role (STANDING RULE: a revoke crashes the backend on this image;
-- grant it and refuse inside) and answers:
--   anon                          false / null (as 20260922090000);
--   authenticated                 normally only when uid = auth.uid();
--                                 otherwise false / null;
--   anyone else (service_role,    normally, about anyone. posts_stamp_campus
--   postgres, triggers fired by   relies on this for club posts the service
--   service-role writes)          role inserts (src/app/api/orgs/[slug]/posts).
-- `role` is the request role PostgREST sets; a SECURITY DEFINER function runs
-- as its owner but does not change it (20260922090000 relies on the same).
--
-- WHY EVERY CALLER KEEPS WORKING (checked 2026-09-22, production and local)
--   * All 17 policies that call the three helpers pass auth.uid() as uid:
--     channels_insert_authenticated, channels_select_org_member,
--     message_reactions_insert_member, message_reactions_select_member,
--     messages_insert_org_member, messages_select_org_member,
--     org_channel_members_delete / _insert / _select, org_followers_select,
--     org_invites_select, org_join_requests_select, org_members_delete /
--     _select / _update, orgs_select, orgs_update. The body below re-checks
--     this and aborts if any policy passes something else.
--   * can_view_org_channel passes its own uid through to the other two.
--   * posts_stamp_campus passes new.user_id: equal to auth.uid() on a
--     user-client insert (posts_insert_authenticated checks it), and the
--     service role otherwise. No other function, and no view, calls them.
--   * src/lib/messages/channel-access.ts:50 calls can_view_org_channel with
--     the session user through the user client.
--   * No SELECT policy text changes, so no screen can empty.
-- A future feature that needs ANOTHER student's club role must read
-- org_members with the service role after its own check, not through these
-- helpers (T2 Risk 4).
--
-- LIVE STATE BEFORE THIS FILE (read-only MCP, production, 2026-09-22; local
-- identical): the 20260922090000 bodies, md5(pg_get_functiondef):
--   can_view_org_channel  a7d9eaf99d263f33d60a1a91d341b751
--   is_org_member         531fc6d7f8f63f71cc3ccaf0312ffc9d
--   org_member_role       a005870235f89d66579fe3a2985f01c1
-- ACL on all three: {postgres=X,authenticated=X,service_role=X,anon=X}.
--
-- DEPLOY ORDER. Independent of the T2 code: no route asks these helpers about
-- anyone but the session user. Planned right after file 1
-- (20260922120000), each with Franky's explicit yes (rulings H2, M5). The two
-- T2 files commute (they touch different functions), so if this one has to go
-- first, the orchestrator renumbers it below file 1 before applying
-- (PRE-FLIGHT a).
--
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes).
--   0. PRE-FLIGHT, read-only. STOP on anything you can't explain.
--      a. Version gate (rulings H2): my PLANNED predecessor present, my own
--         version absent. The planned predecessor is file 1
--         (20260922120000). The real dependency is only 20260922090000, and
--         the md5 check at the top of the body enforces it.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260922090000', '20260922120000', '20260922120500')
--            ORDER BY 1;
--           -- expect exactly TWO rows: 20260922090000, 20260922120000.
--           -- 20260922120500 present: already applied. STOP.
--           -- 20260922090000 missing: STOP (the body would abort anyway).
--           -- 20260922120000 missing: this file is ahead of the plan. That is
--           --   safe (the two files commute), but renumber this file first:
--           --   a version above every applied version and below file 1's, so
--           --   `supabase db reset` replays the order production saw. Then
--           --   run this gate again with the new number.
--      b. The md5s above (the body re-checks them and aborts otherwise):
--           SELECT p.proname, md5(pg_get_functiondef(p.oid)) FROM pg_proc p
--            WHERE p.pronamespace = 'public'::regnamespace
--              AND p.proname IN ('is_org_member', 'org_member_role', 'can_view_org_channel')
--            ORDER BY 1;
--      c. Every calling policy passes auth.uid() (the body re-checks):
--           SELECT tablename, policyname FROM pg_policies
--            WHERE schemaname = 'public'
--              AND (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
--                  ~ '(is_org_member|org_member_role|can_view_org_channel)'
--            ORDER BY 1, 2;   -- the 17 above
--      d. The local-stack acceptance (T2.md 4.11 and 4.12, run serially by the
--         acceptance agent) passed, log in the handoff.
--   1. Apply with the management-API curl recipe
--      (20260916120000_org_followers.sql:443-458), --rawfile at this file.
--      `[]` means success; a JSON error means nothing was applied.
--   2. Record it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260922120500', 't2b_org_helper_guards');
--      Then write the apply time and the list of week-1 versions applied
--      before it into the session handoff, so a later file applied out of
--      order can be renumbered against the real history.
--
-- POST-CHECK (read-only).
--   SELECT proname, prosrc ~ 'auth\.uid\(\)', proacl::text FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('is_org_member', 'org_member_role', 'can_view_org_channel')
--    ORDER BY 1;   -- t on all three; ACL still includes anon and authenticated
--   SELECT count(*) FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--      AND format_type(p.prorettype, null) NOT IN ('trigger', 'event_trigger')
--      AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
--           OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));  -- 0
--   SMOKE, GET-ONLY (rulings M8), with Franky's session cookie: the SAE org
--   page API (GET /api/orgs/<SAE handle>) → 200 with Franky as a member;
--   GET /api/orgs/<SAE handle>/channels → 200 and the same channel list as
--   before. A drop means a policy lost its helper: ROLLBACK at once.
--
-- ROLLBACK (one transaction; restores ONLY this file's change). The three
-- bodies are the 20260922090000 bodies, pg_get_functiondef output verbatim.
-- Copy the block and strip the first five characters ("--   ") of each line.
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.is_org_member(oid uuid, uid uuid)
--    RETURNS boolean
--    LANGUAGE sql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     SELECT CASE WHEN current_setting('role', true) = 'anon' THEN false ELSE EXISTS (
--       SELECT 1 FROM public.org_members
--       WHERE org_id = oid AND user_id = uid
--     ) END;
--   $function$;
--   CREATE OR REPLACE FUNCTION public.org_member_role(oid uuid, uid uuid)
--    RETURNS text
--    LANGUAGE sql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     SELECT role FROM public.org_members
--     WHERE org_id = oid AND user_id = uid
--       AND current_setting('role', true) IS DISTINCT FROM 'anon';
--   $function$;
--   CREATE OR REPLACE FUNCTION public.can_view_org_channel(cid uuid, uid uuid)
--    RETURNS boolean
--    LANGUAGE sql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     SELECT CASE
--       WHEN current_setting('role', true) = 'anon' THEN false
--       WHEN c.org_id IS NULL THEN false
--       WHEN NOT public.is_org_member (c.org_id, uid) THEN false
--       WHEN c.is_private = false THEN true
--       WHEN public.org_member_role (c.org_id, uid) IN ('owner','admin') THEN true
--       ELSE EXISTS (
--         SELECT 1 FROM public.org_channel_members ocm
--         WHERE ocm.channel_id = cid AND ocm.user_id = uid
--       )
--     END
--     FROM public.channels c
--     WHERE c.id = cid;
--   $function$;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922120500';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- CREATE OR REPLACE keeps each function's owner and ACL; nothing is granted
-- or revoked either way (standing rule).
-- ---------------------------------------------------------------------------

begin;

-- CREATE OR REPLACE FUNCTION takes no table lock; this only bounds the wait
-- on the catalog if something unusual holds it.
set local lock_timeout = '5s';

-- 0a. The bodies must be the 20260922090000 bodies read on 2026-09-22. Any
--     other body aborts the whole file (and a second run stops here).
do $$
declare
  expected jsonb := jsonb_build_object(
    'can_view_org_channel', 'a7d9eaf99d263f33d60a1a91d341b751',
    'is_org_member',        '531fc6d7f8f63f71cc3ccaf0312ffc9d',
    'org_member_role',      'a005870235f89d66579fe3a2985f01c1');
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
    if expected ->> r.proname <> r.h then
      raise exception 't2b: % has an unexpected body (md5 %); stop and re-read it', r.proname, r.h;
    end if;
  end loop;
  if n <> 3 then
    raise exception 't2b: expected 3 functions, found %', n;
  end if;
end $$;

-- 0b. Every caller asks about the caller. A policy passing anything but
--     auth.uid() (or `( SELECT auth.uid() AS uid)`) as the user argument, or
--     a function or view other than the two known callers, would silently
--     change meaning under the guard: stop and review it instead.
do $$
declare
  helper text := '(is_org_member|org_member_role|can_view_org_channel)';
  caller_arg text :=
    '(is_org_member|org_member_role|can_view_org_channel)\s*\(\s*[A-Za-z_.]+\s*,\s*'
    || '(auth\.uid\(\)|\(\s*SELECT auth\.uid\(\) AS uid\))\s*\)';
  bad text;
begin
  select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), caller_arg, '', 'gi')
         ~* helper;
  if bad is not null then
    raise exception 't2b: these policies call an org helper about someone other than auth.uid(): %', bad;
  end if;

  select string_agg(n.nspname || '.' || p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~* helper
     and n.nspname not in ('pg_catalog', 'information_schema')
     and not (n.nspname = 'public'
              and p.proname in ('can_view_org_channel', 'posts_stamp_campus'));
  if bad is not null then
    raise exception 't2b: unexpected functions call an org helper: %', bad;
  end if;

  select string_agg(schemaname || '.' || viewname, ', ') into bad
    from pg_views
   where definition ~* helper
     and schemaname not in ('pg_catalog', 'information_schema');
  if bad is not null then
    raise exception 't2b: views call an org helper: %', bad;
  end if;
end $$;

-- 1. The guard. The rest of each body is the 20260922090000 body verbatim. ---
CREATE OR REPLACE FUNCTION public.is_org_member(oid uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN current_setting('role', true) = 'authenticated'
         AND uid IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = oid AND user_id = uid
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.org_member_role(oid uuid, uid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.org_members
  WHERE org_id = oid AND user_id = uid
    AND current_setting('role', true) IS DISTINCT FROM 'anon'
    AND (current_setting('role', true) IS DISTINCT FROM 'authenticated'
         OR uid = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.can_view_org_channel(cid uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN current_setting('role', true) = 'authenticated'
         AND uid IS DISTINCT FROM auth.uid() THEN false
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

-- 2. Grants. CREATE OR REPLACE keeps the ACL; restate it so the standing rule
--    holds even if someone changed it by hand. Nothing is revoked.
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid)        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_member_role(uuid, uuid)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_org_channel(uuid, uuid) TO anon, authenticated, service_role;

-- 3. Post-check inside the transaction: any miss aborts the whole file.
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
    raise exception 't2b: % public functions deny EXECUTE (standing rule)', n;
  end if;

  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('is_org_member', 'org_member_role', 'can_view_org_channel')
     and p.prosrc ~ 'auth\.uid\(\)';
  if n <> 3 then
    raise exception 't2b: expected 3 guarded helpers, found %', n;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
