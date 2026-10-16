-- ---------------------------------------------------------------------------
-- 20261015120000_rate_limits_purge.sql
--
-- PLAIN ENGLISH
-- The limiter (public.rate_limits, src/lib/rate-limit.ts) keeps one count per
-- key and window: the key (an account id, a hashed address or, from Wave 2
-- on, a scrambled network code), when the window started, and how many. Until
-- now an old count went only when some later count happened to clean up (1
-- call in 100, inside rate_limit_hit), so on a quiet week a count could
-- outlive its window, and a deleted account, by weeks (the residual named in
-- 20260922104000_email_sends.sql). From this file on, both daily crons delete
-- every count whose window started over a day ago, and the Privacy Policy,
-- changed in the same deploy, says limiter counts are deleted within three
-- days. Franky's call, Oct 15: purge all limiter counts within 3 days, with
-- the policy changed the same deploy.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT: public.rate_limits is there with its three columns
--      (20260903100000); nothing else sits under the name rate_limits_purge,
--      and a rate_limits_purge() already there (a re-run) returns integer;
--      the role running this file may delete from rate_limits (it becomes the
--      function's owner, and the function deletes as its owner).
--   1. An index on rate_limits (window_start), so the purge (and
--      rate_limit_hit's own cleanup) finds the old windows without reading
--      every row. The table is small (production held 11 rows on Oct 15), so
--      a plain create index holds off the limiter's writes for milliseconds;
--      CONCURRENTLY can't run inside a transaction.
--   2. public.rate_limits_purge(): deletes every row whose window started
--      over a day ago and answers how many (integer). SECURITY DEFINER,
--      search_path ''. Every window divides the day and is a day at most
--      (src/lib/rate-limit.ts refuses any other window), so a window that
--      started over a day ago has ended: the purge never deletes a count that
--      is still in use, and no limit changes. rate_limit_hit only reads and
--      writes the current window.
--   3. EXECUTE for anon, authenticated and service_role, and anon and
--      authenticated are refused INSIDE (42501): the standing rule
--      (20260922090000), never a revoke from an API role. Only the service
--      role (the two crons) and the owner, by hand, can purge.
--   4. RUNS THE PURGE ONCE, at the end, so nothing older than a day is left
--      by the time the policy's "within three days" goes live.
--   5. POST-CHECK, then notify pgrst.
--
-- WHO CALLS IT: GET /api/cron/waitlist-purge (08:17 UTC) and GET
-- /api/cron/school-checkin (14:47 UTC), vercel.json, each after its own job.
-- A failed purge is logged and answered as rate_limits_deleted: null, never
-- as the job failing. Two crons, not one: Vercel Cron on Hobby runs at any
-- minute of its hour and never retries.
--
-- WHY "WITHIN THREE DAYS" HOLDS. A row is deleted by the first run more than
-- a day after its window started. Either cron alone runs about every 24 h
-- (25 at most), so a row is gone about 2 days after its window started at
-- the latest, and sooner with both running. Only both crons failing on the
-- same day could carry a row past three days, and rate_limit_hit's 1-in-100
-- cleanup still runs on every count in between.
--
-- DOES NOT: redefine rate_limit_hit (its 1-in-100 cleanup stays as it is);
-- change the table's grants (postgres and service_role only, RLS on, no
-- policy); read or print a key. The purge answers a count and the post-check
-- counts.
--
-- APPLIED on the local database on 2026-10-15, twice in a row, and checked
-- there (see the end of this header).
-- src/lib/rate-limit-purge-migration.test.ts keeps the refusal, the grants,
-- search_path, the index and the end-of-file run from drifting.
-- Production: the main session.
--
-- LIVE STATE: not read for this file. Before applying, read on production
-- (settings and counts, allowed by the counts-only rule):
--   SELECT to_regprocedure('public.rate_limits_purge()') IS NULL          AS fn_absent,
--          to_regclass('public.rate_limits_window_start_idx') IS NULL      AS idx_absent,
--          (SELECT count(*) FROM public.rate_limits
--            WHERE window_start < now() - interval '1 day')               AS old_rows;
--   -- expect t, t, and a small number (production had 0 of 11 on Oct 15).
--
-- DEPLOY ORDER. THIS FILE FIRST, before the deploy that changes the Privacy
-- Policy: it runs the purge once, so "within three days" is true from the
-- moment the policy goes live. The code may land first without harm: while
-- the function is missing (PGRST202 / 42883) the crons log it, answer
-- rate_limits_deleted: null, and run their own jobs as before.
-- AFTER the deploy is confirmed live:
-- 20261015130000_rate_limits_drop_raw_ip_rows.sql (deletes the counts the old
-- code keyed on a network address).
--
-- HOW TO APPLY BY HAND: the Supabase connector's apply_migration with the
-- body below minus begin/commit (then rename its auto-timestamp row in
-- schema_migrations to this file's version), or the Management API curl
-- recipe in 20260926100000_users_profile_layout.sql. As postgres. Then
-- record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261015120000', 'rate_limits_purge') ON CONFLICT (version) DO NOTHING;
-- Checks by hand afterwards (as postgres, in the SQL editor):
--   SELECT public.rate_limits_purge();          -- a count: 0 straight after this file
--   BEGIN; SET LOCAL ROLE anon; SELECT public.rate_limits_purge(); ROLLBACK;
--   BEGIN; SET LOCAL ROLE authenticated; SELECT public.rate_limits_purge(); ROLLBACK;
--   -- expect ERROR 42501 "not allowed" both times, and the connection stays up.
--   SELECT count(*) FROM public.rate_limits
--    WHERE window_start < now() - interval '1 day';   -- 0
--
-- ROLLBACK. The crons keep working: they answer rate_limits_deleted: null
-- and log it. The policy's "within three days" goes back the same day, since
-- only rate_limit_hit's 1-in-100 cleanup is left. Dropping is not the crash
-- the standing rule warns about: a missing function answers PGRST202; only a
-- function that exists and refuses EXECUTE crashes the backend.
--   BEGIN;
--   DROP FUNCTION public.rate_limits_purge();
--   DROP INDEX public.rate_limits_window_start_idx;  -- optional: it only speeds the cleanup
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261015120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- CHECKED LOCALLY (2026-10-15), as postgres on the local stack: the first run
-- purged 22 old counts of 23, the second 0. EXECUTE held by anon,
-- authenticated and service_role (and the owner, postgres), not PUBLIC;
-- SECURITY DEFINER, search_path "". As anon and as authenticated (SET LOCAL
-- ROLE), and as anon through the REST API (HTTP 401, code 42501): refused
-- with 42501, and the connection stayed up (the postmaster's start time did
-- not move). As service_role through the REST API: 200 and a count. With
-- five made-up rows, rolled back: an hour window that started 25 h ago, a
-- day window from 2 days ago and yesterday's day window went; this hour's
-- window and one that started 23 h 59 min ago stayed. Kept off sequential
-- scans, the planner takes rate_limits_window_start_idx for the purge.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  f oid := to_regprocedure('public.rate_limits_purge()')::oid;
begin
  if to_regclass('public.rate_limits') is null then
    raise exception 'rate-limits-purge: public.rate_limits is missing (20260903100000)';
  end if;
  if (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
        from pg_attribute a
       where a.attrelid = 'public.rate_limits'::regclass and a.attnum > 0 and not a.attisdropped)
     is distinct from 'key text, window_start timestamp with time zone, count integer' then
    raise exception 'rate-limits-purge: public.rate_limits is not (key text, window_start timestamptz, count integer)';
  end if;
  -- create or replace below keeps an existing function's owner and grants
  -- (a re-run); anything else under the name stops the file.
  if exists (select 1
               from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.proname = 'rate_limits_purge'
                and p.oid is distinct from f) then
    raise exception 'rate-limits-purge: another public.rate_limits_purge sits beside rate_limits_purge(); drop it first';
  end if;
  if f is not null and (select p.prorettype from pg_proc p where p.oid = f) <> 'integer'::regtype then
    raise exception 'rate-limits-purge: public.rate_limits_purge() returns something other than integer; drop it first';
  end if;
  if not has_table_privilege(current_user, 'public.rate_limits', 'DELETE') then
    raise exception 'rate-limits-purge: % may not delete from public.rate_limits; run this file as postgres', current_user;
  end if;
end $$;

-- 1. THE INDEX ---------------------------------------------------------------
create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

-- 2. THE PURGE ---------------------------------------------------------------
create or replace function public.rate_limits_purge()
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $purge$
declare
  v_deleted integer;
begin
  -- The standing rule: every API role may call this, and the two a browser
  -- can be are refused here (a RAISE inside does not crash the backend).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Every window is a day at most and divides the day (src/lib/rate-limit.ts),
  -- so one that started over a day ago has ended. The same line as
  -- rate_limit_hit's own cleanup.
  delete from public.rate_limits
   where window_start < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$purge$;

comment on function public.rate_limits_purge() is
  'Deletes every public.rate_limits count whose window started over a day ago (that window has ended) and answers how many. '
  'Service role only: anon and authenticated are refused inside (42501). Called by both daily crons (20261015120000).';

-- EXECUTE for every API role, on purpose (standing rule since 2026-09-22,
-- 20260922090000_guard_function_privileges.sql): on Supabase's Postgres image
-- a role calling a public function it can't EXECUTE crashes the backend and
-- drops every connection, so the refusal lives INSIDE the function. PUBLIC's
-- default goes; the three API roles hold it by name. Never revoke anon or
-- authenticated here.
revoke all on function public.rate_limits_purge() from public;
grant execute on function public.rate_limits_purge() to anon, authenticated, service_role;

-- 3. RUN IT ONCE, now ----------------------------------------------------------
-- Before the policy says "within three days", nothing older than a day.
do $$
declare
  n integer;
begin
  n := public.rate_limits_purge();
  raise notice 'rate-limits-purge: % old counts deleted', n;
end $$;

-- 4. POST-CHECK inside the transaction ---------------------------------------
do $$
declare
  bad text := '';
  f   regprocedure := to_regprocedure('public.rate_limits_purge()');
  idx regclass := to_regclass('public.rate_limits_window_start_idx');
  api text;
begin
  if f is null then
    raise exception 'rate-limits-purge post-check failed: the function is missing';
  end if;

  foreach api in array array['anon', 'authenticated', 'service_role'] loop
    if not has_function_privilege(api, f, 'execute') then
      bad := bad || format(' rate_limits_purge is refused to %s (the standing rule);', api);
    end if;
  end loop;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    bad := bad || ' PUBLIC holds EXECUTE on rate_limits_purge;';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = f) then
    bad := bad || ' rate_limits_purge is not SECURITY DEFINER;';
  end if;
  if (select p.proconfig from pg_proc p where p.oid = f) is distinct from array['search_path=""'] then
    bad := bad || ' rate_limits_purge does not pin search_path to empty;';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = f) <> 'integer'::regtype then
    bad := bad || ' rate_limits_purge does not return integer;';
  end if;
  if not has_table_privilege((select p.proowner from pg_proc p where p.oid = f), 'public.rate_limits', 'DELETE') then
    bad := bad || ' the owner of rate_limits_purge may not delete from rate_limits;';
  end if;

  if idx is null or not exists (
       select 1
         from pg_index i
        where i.indexrelid = idx
          and i.indrelid = 'public.rate_limits'::regclass
          and i.indisvalid
          and i.indnatts = 1
          and i.indkey[0] = (select a.attnum from pg_attribute a
                              where a.attrelid = 'public.rate_limits'::regclass
                                and a.attname = 'window_start')) then
    bad := bad || ' rate_limits_window_start_idx is missing, invalid or not on (window_start);';
  end if;

  -- The table's own lock did not move: RLS on, no policy, nothing for a browser.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.rate_limits'::regclass)
     or exists (select 1 from pg_policy p where p.polrelid = 'public.rate_limits'::regclass) then
    bad := bad || ' rate_limits has RLS off or a policy;';
  end if;
  foreach api in array array['anon', 'authenticated'] loop
    if has_table_privilege(api, 'public.rate_limits', 'select,insert,update,delete,truncate,references,trigger') then
      bad := bad || format(' %s holds a privilege on rate_limits;', api);
    end if;
  end loop;

  -- The run above took everything older than a day (a count, never a key).
  if exists (select 1 from public.rate_limits where window_start < now() - interval '1 day') then
    bad := bad || ' a count older than a day is still there after the purge;';
  end if;

  if bad <> '' then
    raise exception 'rate-limits-purge post-check failed:%', bad;
  end if;
end $$;

-- 5. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
