-- ---------------------------------------------------------------------------
-- 20261013090000_email_kind_signin_hint.sql
--
-- PLAIN ENGLISH
-- Forgot password sends its reset to the address an account SIGNS IN with.
-- 15 of the 20 accounts sign in with a different address than their school
-- email, so typing the school address got the neutral sentence and no email
-- (Franky hit it himself, Oct 13). The fix: when the typed address is an
-- account's verified school email, or the personal email it added, that inbox
-- gets a short note: "your Vibe account signs in with a different email
-- (g•••@gmail.com), use that one". The screen says the same sentence as
-- before. This file lets the email log record that note.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: the email log's list of kinds is the seven-kind one of
--      20261008140000, and nothing else.
--   2. The email log learns one more kind, 'signin_hint', so the note is
--      logged like every other email (a scrambled code in place of the
--      address, never the address).
--   3. POST-CHECK: the list names all eight kinds.
--
-- DOES NOT: add a table or a column, change a row, or touch who can read
-- what. The note itself is code (src/app/api/auth/password-reset/route.ts,
-- src/lib/auth/signin-hint.ts).
--
-- APPLIED ON PRODUCTION 2026-10-13, before the code was pushed (DEPLOY ORDER
-- below), through the Supabase connector: the pre-flight read matched (the
-- seven kinds), the rule now names eight ending in 'signin_hint', and the row
-- is recorded as 20261013090000. Applied on the local database the same day.
--
-- LIVE STATE: not read for this file. Before applying, read on production
-- (settings, allowed by the counts-only rule):
--   SELECT pg_get_constraintdef(oid) AS kinds
--     FROM pg_constraint
--    WHERE conrelid='public.email_sends'::regclass AND conname='email_sends_kind_check';
--   -- expect the seven-kind list of 20261008140000, ending in 'school_checkin'.
--
-- DEPLOY ORDER. THIS FILE FIRST, then the push. A push to main is live within
-- minutes on this project, so the code goes first unless this file is applied
-- before the push.
--   Why it matters: the email log writes its row after the send. With the
--   code live and the seven-kind list still in place, every note goes out
--   and its log row is refused. One "[email-send-log] insert failed:" line
--   in Vercel is then the only trace of it. Privacy Policy 3d says "We log
--   each email our own software sends", and scripts/email-send-lookup.mjs
--   could not answer "did we send it" for that note.
--   Nothing breaks in that order (the route answers, the reset email and the
--   note still go; the send log never changes a send). It is the promise
--   that would be untrue, for every note sent until this file is applied.
--   This file first costs nothing: the list allows a kind nothing writes yet.
--
-- THE SAME DAY as the code goes live: the Privacy Policy counts this email
-- among the automatic ones and says what it shows (the first character and
-- the part after the @ of the sign-in email, to the inbox that was typed).
--
-- HOW TO APPLY: the Supabase connector's apply_migration with the body below
-- minus begin/commit, then rename its schema_migrations row to this version
-- (as 20261008130000 and 20261008140000 were).
--
-- ROLLBACK:
--   BEGIN;
--   ALTER TABLE public.email_sends DROP CONSTRAINT email_sends_kind_check;
--   ALTER TABLE public.email_sends ADD CONSTRAINT email_sends_kind_check
--     CHECK (kind IN ('school_verification', 'password_reset', 'moderation_alert',
--                     'waitlist_confirm', 'waitlist_invite', 'personal_email_code',
--                     'school_checkin'));   -- after deleting any 'signin_hint' rows
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261013090000';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  got text;
begin
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.email_sends'::regclass and conname = 'email_sends_kind_check';
  if got is distinct from
     'CHECK ((kind = ANY (ARRAY[''school_verification''::text, ''password_reset''::text, ''moderation_alert''::text, ''waitlist_confirm''::text, ''waitlist_invite''::text, ''personal_email_code''::text, ''school_checkin''::text])))'
  then
    raise exception 'signin-hint: email_sends_kind_check is not the one this file widens: %', coalesce(got, '(missing)');
  end if;
end $$;

-- 1. the email log's kinds ---------------------------------------------------
-- Same order as EMAIL_SEND_KINDS in src/lib/email/send-log-core.ts
-- (send-log-core.test.ts reads this statement and compares the two).
alter table public.email_sends drop constraint email_sends_kind_check;
alter table public.email_sends
  add constraint email_sends_kind_check
  check (kind in ('school_verification', 'password_reset', 'moderation_alert',
                  'waitlist_confirm', 'waitlist_invite', 'personal_email_code',
                  'school_checkin', 'signin_hint'));

-- 2. POST-CHECK inside the transaction ---------------------------------------
-- The new kind is there and widening did not quietly drop an old one.
do $$
declare
  got text;
  kind_name text;
begin
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.email_sends'::regclass and conname = 'email_sends_kind_check';
  foreach kind_name in array array['school_verification', 'password_reset', 'moderation_alert',
                                   'waitlist_confirm', 'waitlist_invite', 'personal_email_code',
                                   'school_checkin', 'signin_hint'] loop
    if got is null or position('''' || kind_name || '''' in got) = 0 then
      raise exception 'signin-hint: email_sends_kind_check does not name %: %', kind_name, coalesce(got, '(missing)');
    end if;
  end loop;
end $$;

commit;
