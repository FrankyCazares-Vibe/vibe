-- Week 1 / batch P1: six profile-detail columns on public.users stop being
-- self-serve through PostgREST. The server writes them with the service role,
-- after auth, the Terms gate and validation.
--
-- WHY THIS EXISTS. recruiter_snapshot, skills, interests, work_experience,
-- pinned_post_id and looking_for are still in the self-serve UPDATE list
-- (20260903100000_security_hardening.sql:53-59). Policy `users_update_self`
-- is USING / WITH CHECK (auth.uid() = id) and the browser holds the anon key,
-- so `PATCH /rest/v1/users?id=eq.<me>` skipped every route validator: the
-- 40 / 60-item caps and 80-char trims on interests and skills, the
-- work-experience sanitizer, the looking_for token check, and the "pin only
-- your own post" check in src/app/api/me/pinned/route.ts. looking_for joins
-- the list because P1 starts rendering it on the owner's profile (the "Here
-- for" row).
--
-- WHY looking_for LOSES SELECT TOO (rulings H6). Nine students answered "what
-- are you here for?" in onboarding without being told it would show on
-- their profile, so until Franky decides otherwise only the owner sees the
-- answer. The routes strip it for everyone else
-- (api/users/[handle]/bootstrap); revoking the column SELECT makes that the
-- boundary, since any signed-in student could otherwise read every answer
-- straight through PostgREST. Every reader of looking_for runs on the
-- service client (walk below). If Franky makes it public, re-grant SELECT.
--
-- MEASURED ON THE LIVE DB (read-only; 2026-09-21, re-checked 2026-09-22):
--   * has_column_privilege('authenticated','public.users',c,'UPDATE') = true
--     for all six columns, and SELECT = true for all six. anon UPDATE = false
--     on all six.
--   * public.users ACL: authenticated=dDxtm/postgres. No table-wide `w` or
--     `r`, so the column grants are the ONLY UPDATE / SELECT path and
--     revoking them is a real boundary.
--   * No function in `public` or `auth`, no view in `public`, no trigger and
--     no RLS policy references any of the six columns (the only trigger on
--     users is users_campus_in_system, on the campus columns).
--   * 20 users. recruiter_snapshot non-empty on 7 rows (on 6 of them the
--     stored values equal the derived ones: the desktop profile saved its own
--     DOM back on every load); pinned_post_id set on 0 rows; looking_for set
--     on 9 rows, known tokens only.
--   * 0 public non-trigger functions deny EXECUTE to anon or authenticated.
--
-- SELECT WALK (grep of src/ and public/html/, 2026-09-22).
--   * recruiter_snapshot: after the P1 code no select names it. Before P1
--     the four selects that did (api/me/profile, api/me/profile-sync,
--     api/me/profile-bootstrap, api/users/[handle]/bootstrap) all ran on the
--     SERVICE client.
--   * looking_for: read only by those same four routes plus the onboarding
--     page and /onboarding/classic, all on the SERVICE client. No public/
--     file talks to PostgREST.
--   * `select=*` on users is already impossible for `authenticated` (email
--     is not granted); no view or function reads either column. So neither
--     revoke empties a screen.
--   * SELECT on skills, interests, work_experience and pinned_post_id stays:
--     they are public profile data, and bootstrap reads pinned_post_id with
--     the viewer's own client.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES AND DOES NOT DO
--
-- DOES: revokes UPDATE on the six columns, and SELECT on recruiter_snapshot
-- and looking_for, from `authenticated`. Column privileges only.
--
-- DOES NOT: revoke EXECUTE on any function (standing rule, rulings.md: on
-- this Postgres image calling a function without EXECUTE crashes the
-- backend). It does not touch the recruiter_snapshot column itself: no DROP,
-- no data rewrite, no default change; the service role can still read it. It
-- does not narrow any other self-serve grant on users (name, bio, tagline,
-- current_on, ...): other routes still write some of them with the cookie
-- client (/api/me/heartbeat writes last_active_at), so that walk is its own
-- batch.
-- ---------------------------------------------------------------------------
--
-- DEPLOY ORDER: code first, this migration last. The code before P1 wrote
-- these columns with the caller's cookie client (profile-sync, PATCH
-- /api/me/profile, PATCH /api/me/pinned); against this migration that is a
-- 42501 and every profile save, tag edit and pin fails with "Request failed"
-- / "Could not save profile". The P1 code writes them with the service role,
-- so it works with or without this file. Cached desktop bundles only call
-- routes, so they are unaffected once the P1 routes are live. Once applied,
-- never instant-roll Vercel back past P1's code; run the ROLLBACK first
-- (rulings M9).
--
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes).
--   0. PRE-FLIGHT, read-only. STOP on anything you can't explain.
--      a. Version gate (rulings H2): my predecessor present, my own version
--         absent.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260922120500', '20260922130000')
--            ORDER BY 1;
--           -- expect exactly ONE row: 20260922120500.
--           -- 20260922130000 present: already applied. STOP.
--           -- 20260922120500 missing: this file is ahead of the plan. It
--           --   does not depend on T2b, but renumber it first (a version
--           --   above every applied version) so `supabase db reset` replays
--           --   the order production saw, then run this gate again.
--      b. The grants are still there:
--           SELECT c, has_column_privilege('authenticated','public.users',c,'UPDATE')
--             FROM unnest(ARRAY['recruiter_snapshot','skills','interests',
--                               'work_experience','pinned_post_id','looking_for']) c;
--           -- six rows, all true
--      c. The P1 deploy is READY on Vercel (gh status check in the live
--         verification recipe) and serving the new page:
--           curl -s https://www.connectvibe.app/html/profile.html | grep -c recruiterCard   # 0
--           curl -s https://www.connectvibe.app/html/profile.html | grep -c hereForRow      # >= 1
--         A 401 from an unauthenticated route call proves nothing here (the
--         old code answers 401 too).
--      d. The local-stack acceptance for P1 passed, log in the handoff.
--   1. Apply with the management-API curl recipe
--      (20260912102000_users_media_url_host_lock.sql:92-104), --rawfile at
--      this file. `[]` means success; a JSON error means nothing was applied.
--   2. Record it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260922130000', 'users_profile_detail_server_only');
--
-- POST-CHECK (read-only; the body also checks all of this and aborts).
--   SELECT c, has_column_privilege('authenticated','public.users',c,'UPDATE')
--     FROM unnest(ARRAY['recruiter_snapshot','skills','interests',
--                       'work_experience','pinned_post_id','looking_for']) c;
--   -- six rows, all false
--   SELECT has_column_privilege('authenticated','public.users','recruiter_snapshot','SELECT'), -- false
--          has_column_privilege('authenticated','public.users','looking_for','SELECT'),        -- false
--          has_column_privilege('authenticated','public.users','skills','SELECT'),             -- true
--          has_column_privilege('authenticated','public.users','pinned_post_id','SELECT'),     -- true
--          has_column_privilege('authenticated','public.users','bio','UPDATE');                -- true (untouched)
--   SELECT count(*) FROM public.users WHERE recruiter_snapshot <> '{}'::jsonb;
--   -- 7 (no data touched)
--   SELECT count(*) FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--      AND format_type(p.prorettype, null) NOT IN ('trigger', 'event_trigger')
--      AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
--           OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- 0 (standing rule)
--   LIVE, by Franky (these are his own writes): on desktop add a tag and a
--   skill, pin and unpin a post, toggle a "Here for" chip, hard refresh: all
--   persist. On the phone: edit profile, toggle a chip, Save, reload.
--
-- ROLLBACK (restores ONLY this file's change; roll the code back first only
-- if the code is the problem, the grants alone can be restored any time):
--   BEGIN;
--   GRANT UPDATE (recruiter_snapshot, skills, interests, work_experience,
--                 pinned_post_id, looking_for) ON public.users TO authenticated;
--   GRANT SELECT (recruiter_snapshot, looking_for) ON public.users TO authenticated;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922130000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- Bounds the wait on the catalog if something unusual holds it.
set local lock_timeout = '5s';

-- 1. Six profile-detail columns leave the self-serve UPDATE list
--    (20260903100000_security_hardening.sql:53-59). The server writes them
--    with the service role after auth, the Terms gate and validation.
revoke update (recruiter_snapshot, skills, interests, work_experience,
               pinned_post_id, looking_for)
  on public.users from authenticated;

-- 2. The snapshot is no longer shown anywhere; stop exposing the 7 stored
--    copies to every signed-in student. The column stays (a later migration
--    may drop it); the service role still reads it. looking_for is shown to
--    its owner only (rulings H6), through service-role routes.
revoke select (recruiter_snapshot, looking_for) on public.users from authenticated;

-- 3. Post-check inside the transaction: any miss aborts the whole file.
do $$
declare
  n int;
  c text;
begin
  foreach c in array array['recruiter_snapshot', 'skills', 'interests',
                           'work_experience', 'pinned_post_id', 'looking_for']
  loop
    if has_column_privilege('authenticated', 'public.users', c, 'UPDATE') then
      raise exception 'p1: authenticated can still UPDATE users.%', c;
    end if;
  end loop;

  foreach c in array array['recruiter_snapshot', 'looking_for']
  loop
    if has_column_privilege('authenticated', 'public.users', c, 'SELECT') then
      raise exception 'p1: authenticated can still SELECT users.%', c;
    end if;
  end loop;

  foreach c in array array['skills', 'interests', 'work_experience', 'pinned_post_id']
  loop
    if not has_column_privilege('authenticated', 'public.users', c, 'SELECT') then
      raise exception 'p1: authenticated lost SELECT on users.%', c;
    end if;
  end loop;

  if not has_column_privilege('authenticated', 'public.users', 'bio', 'UPDATE') then
    raise exception 'p1: users.bio lost its self-serve UPDATE grant';
  end if;

  if not has_column_privilege('service_role', 'public.users', 'recruiter_snapshot', 'SELECT')
     or not has_column_privilege('service_role', 'public.users', 'looking_for', 'UPDATE') then
    raise exception 'p1: service_role lost access to users';
  end if;

  -- Standing rule (rulings.md): no public, non-trigger function denies
  -- EXECUTE to anon or authenticated. This file revokes none; the check
  -- makes sure the database it lands on still holds that.
  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then
    raise exception 'p1: % public functions deny EXECUTE (standing rule)', n;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
