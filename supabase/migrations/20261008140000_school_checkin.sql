-- ---------------------------------------------------------------------------
-- 20261008140000_school_checkin.sql
--
-- PLAIN ENGLISH
-- School email first (S75): an account signs in with a school email, and a
-- school closes that inbox after graduation. Nothing tells us when. So once
-- a year an account that signs in with a school email and has NO personal
-- email is sent a code at its school address (Franky, Oct 8: "yearly
-- check-in and 90 days"). Typed in: nothing changes for another year. Not
-- typed in within 14 days: a 90-day countdown starts, shown in the app. A
-- personal email added at any point ends it for good. At day 90 with neither,
-- the account is deleted. This file adds the three dates that keeps.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: the columns do not exist; no client role holds table-level
--      SELECT on users, so the new columns are private from the start.
--   2. users.school_confirmed_at     the last time the school inbox was proven
--                                    by a check-in (null = never checked in:
--                                    the app counts the year from created_at)
--      users.school_checkin_sent_at  a check-in is open since then
--      users.school_grace_ends_at    the countdown's last day
--   3. The email log learns the kind 'school_checkin'.
--   4. POST-CHECK: no client role can read or write the three columns.
--
-- DOES NOT: start anything. No row changes. The daily job
-- (/api/cron/school-checkin) does the work, and it deletes nothing unless
-- SCHOOL_CHECKIN_DELETE_ENABLED is "true" in Vercel.
--
-- APPLIED ON PRODUCTION 2026-10-08 (Franky: "build it now"), through the
-- Supabase connector; the pre-flight read matched; recorded under this file's
-- version. 0 accounts had a check-in open afterwards.
--
-- LIVE STATE (as written before applying): not read for this file. Before applying, read on production
-- (settings, allowed by the counts-only rule):
--   SELECT has_table_privilege('authenticated','public.users','SELECT') AS table_select,
--          (SELECT count(*) FROM information_schema.columns
--            WHERE table_schema='public' AND table_name='users'
--              AND column_name IN ('school_confirmed_at','school_checkin_sent_at','school_grace_ends_at')) AS columns_present,
--          (SELECT pg_get_constraintdef(oid) FROM pg_constraint
--            WHERE conrelid='public.email_sends'::regclass AND conname='email_sends_kind_check') AS kinds;
--   -- expect f, 0, and the six-kind list of 20261008130000.
--
-- DEPLOY ORDER. Either order: the routes and the job answer "not available"
-- while the columns are missing.
--
-- HOW TO APPLY: the Supabase connector's apply_migration with the body below
-- minus begin/commit, then rename its schema_migrations row to this version.
--
-- ROLLBACK:
--   BEGIN;
--   ALTER TABLE public.email_sends DROP CONSTRAINT email_sends_kind_check;
--   ALTER TABLE public.email_sends ADD CONSTRAINT email_sends_kind_check
--     CHECK (kind IN ('school_verification', 'password_reset', 'moderation_alert',
--                     'waitlist_confirm', 'waitlist_invite', 'personal_email_code'));  -- after deleting any 'school_checkin' rows
--   ALTER TABLE public.users DROP COLUMN IF EXISTS school_grace_ends_at,
--                            DROP COLUMN IF EXISTS school_checkin_sent_at,
--                            DROP COLUMN IF EXISTS school_confirmed_at;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008140000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  got text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'users'
                and column_name in ('school_confirmed_at', 'school_checkin_sent_at', 'school_grace_ends_at')) then
    raise exception 'school-checkin: the columns already exist (applied already?)';
  end if;
  if has_table_privilege('authenticated', 'public.users', 'SELECT')
     or has_table_privilege('anon', 'public.users', 'SELECT') then
    raise exception 'school-checkin: a client role holds table-level SELECT on users; a new column would be readable';
  end if;
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.email_sends'::regclass and conname = 'email_sends_kind_check';
  if got is distinct from
     'CHECK ((kind = ANY (ARRAY[''school_verification''::text, ''password_reset''::text, ''moderation_alert''::text, ''waitlist_confirm''::text, ''waitlist_invite''::text, ''personal_email_code''::text])))'
  then
    raise exception 'school-checkin: email_sends_kind_check is not the one this file widens: %', coalesce(got, '(missing)');
  end if;
end $$;

-- 1. the three dates ---------------------------------------------------------
alter table public.users
  add column school_confirmed_at timestamptz,
  add column school_checkin_sent_at timestamptz,
  add column school_grace_ends_at timestamptz,
  -- A countdown only ever runs on an open check-in.
  add constraint users_school_grace_needs_checkin
    check (school_grace_ends_at is null or school_checkin_sent_at is not null);

comment on column public.users.school_grace_ends_at is
  'The last day of the 90-day countdown that starts when a yearly school check-in goes unanswered. Past it, with no personal email, the daily job deletes the account (20261008140000).';

-- The daily job looks for open check-ins and ended countdowns.
create index users_school_checkin_open_idx
  on public.users (school_checkin_sent_at)
  where school_checkin_sent_at is not null;

-- 2. the email log's kinds ---------------------------------------------------
-- Same order as EMAIL_SEND_KINDS in src/lib/email/send-log-core.ts.
alter table public.email_sends drop constraint email_sends_kind_check;
alter table public.email_sends
  add constraint email_sends_kind_check
  check (kind in ('school_verification', 'password_reset', 'moderation_alert',
                  'waitlist_confirm', 'waitlist_invite', 'personal_email_code',
                  'school_checkin'));

-- 3. POST-CHECK inside the transaction ---------------------------------------
do $$
declare
  col text;
  role_name text;
begin
  foreach col in array array['school_confirmed_at', 'school_checkin_sent_at', 'school_grace_ends_at'] loop
    foreach role_name in array array['authenticated', 'anon'] loop
      if has_column_privilege(role_name, 'public.users', col, 'SELECT')
         or has_column_privilege(role_name, 'public.users', col, 'UPDATE')
         or has_column_privilege(role_name, 'public.users', col, 'INSERT') then
        raise exception 'school-checkin: % can read or write users.%', role_name, col;
      end if;
    end loop;
  end loop;
end $$;

-- 4. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
