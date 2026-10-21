-- ---------------------------------------------------------------------------
-- 20261022120000_no_self_service_email_change.sql
--
-- PLAIN ENGLISH
-- Closes the email-change side door of the sign-up pre-registration gap
-- (written Oct 21, 2026, after the cross-batch review; prereg-design.md said
-- email change was "off or need a session": it is not off, and the session
-- it needs is the asker's own). Any signed-in account could ask Supabase's
-- own /user endpoint (PUT /auth/v1/user, no captcha) to move its sign-in
-- email onto a student's school address that has not joined yet. Supabase
-- mails a link to that address, IU's mail scanner opens it, and the move is
-- done: the asker keeps their password and session on an account under an
-- inbox they do not hold, and the app then takes it as that student's
-- verified school email. 20261022110000 never sees it (the account was
-- already confirmed). Vibe never changes a sign-in email this way: there is
-- no change-email screen and no updateUser({ email }) in src, and the team
-- changes one by hand through the admin API (Privacy Policy section 9),
-- which writes auth.users.email directly. So from now on the database
-- refuses the one write that starts a self-service change.
--
-- WHAT IT DOES
--   auth_hooks.no_self_service_email_change() and its BEFORE UPDATE OF
--   email_change trigger on auth.users. A write that puts a new, non-empty
--   address into email_change, on a row that is not being soft-deleted, is
--   refused (P0001), so GoTrue's whole request rolls back: no pending
--   address, no tokens, no sent time. The asker gets a 500 (supabase-js
--   reads "Error sending email change email"; a bare request without the
--   API-version header gets this file's P0001 message). Everything else
--   passes:
--     - finishing or cancelling a change: ConfirmEmailChange and
--       ClearAllPendingTokens write '' (models/user.go:564-592, :360-394);
--       NULL passes too;
--     - the admin API's email change: admin.go:305 SetEmail lists `email`
--       only (models/user.go:398-401), so this trigger never fires;
--     - sign-ups (an INSERT), confirmations, password changes, sign-ins:
--       none of them lists email_change;
--     - an admin soft delete (models/user.go:1054-1083 writes a scrambled
--       email_change together with deleted_at; Vibe only hard-deletes).
--   Who writes a new email_change in GoTrue v2.197 (read in source; GoTrue
--   writes auth.users with UpdateOnly and a column list): sendEmailChange
--   (mail.go:524-591), from PUT /user (user.go:251-273) and POST /resend type
--   email_change (resend.go:113, :153); and admin generateLink types
--   email_change_current / email_change_new (mail.go:241-264), which Vibe
--   never calls (it asks only for signup and recovery). All refused.
--   THE MAIL STILL GOES OUT. sendEmailChange mails the new address (and,
--   with Secure email change on, the current one) BEFORE it writes
--   (mail.go:549 vs :565). The write is refused and rolled back, so the link
--   and code in that mail match nothing: they are dead (seen on the local
--   stack, v2.189, Oct 21: GET of the link -> otp_expired, the code -> 403,
--   the account unchanged; the same order in v2.197). The Change-email
--   notice (supabase/templates/email_change.html, dashboard step 2) makes
--   that mail say so, with no link and no code. The sent time is never
--   stored, so GoTrue's per-account wait (smtp_max_frequency, 60 s on
--   production) never slows these tries; each still spends one send of the
--   project's hourly email budget (40/h) and stays behind PUT /user's own
--   limiter (api.go:283). One account could already spend that budget
--   before this file (one try a minute), so the drain is not new.
--   The rule refuses a NEW address only: the same value written again (a
--   resend of a change pending from before this file) would pass. The file
--   counts them once the trigger is in place and stops on any, and none can
--   start after.
--
-- PRE-FLIGHT (inside, section 1; catalog only): auth_hooks exists,
-- auth.users still has email, email_change and deleted_at, not applied
-- before. THE PENDING COUNT (inside, section 3, right after CREATE TRIGGER;
-- counts only): no account (soft-deleted ones aside) has an email change
-- pending. It runs after the trigger, not in section 1, because CREATE
-- TRIGGER holds SHARE ROW EXCLUSIVE on auth.users until COMMIT: a change
-- written before that lock has committed by the time the count reads (CREATE
-- TRIGGER waits for the writer, up to the 5 s lock_timeout), and one written
-- after waits for COMMIT and then meets the trigger. Counted in section 1, a
-- change written but not yet committed would be missed while CREATE TRIGGER
-- waited for it and went on (the cross-batch review, Oct 21). If one is
-- pending, it stops, prints how many and nothing is kept. Ask Franky; only
-- with his yes, cancel them the way GoTrue's ClearAllPendingTokens does
-- (tokens first, while the WHERE still finds the rows), then apply again:
--   delete from auth.one_time_tokens t using auth.users u
--    where t.user_id = u.id and coalesce(u.email_change, '') <> '' and u.deleted_at is null
--      and t.token_type in ('email_change_token_new', 'email_change_token_current');
--   update auth.users set email_change = '', email_change_token_new = '', email_change_token_current = '',
--          email_change_sent_at = null, email_change_confirm_status = 0
--    where coalesce(email_change, '') <> '' and deleted_at is null;
-- On production: NOT read by this batch (it worked on the local stack only).
-- Read on the day, counts only:
--   select count(*) from auth.users where coalesce(email_change, '') <> '' and deleted_at is null;
-- and the GoTrue version (/auth/v1/health): if it is newer than v2.197.0,
-- re-read sendEmailChange, ConfirmEmailChange, ClearAllPendingTokens,
-- SoftDeleteUser, the admin update's SetEmail and every UpdateOnly that
-- lists email_change before applying.
--
-- POST-CHECK (inside, section 3; catalog and counts only, nothing written):
-- the pending count above; then the trigger is enabled, BEFORE UPDATE OF
-- email_change, with the rule in its WHEN; the function is SECURITY DEFINER
-- with an empty search_path, owned by postgres, PUBLIC holds no EXECUTE and
-- supabase_auth_admin does; it prints the function's md5. The behaviour is checked on the local stack by
-- scripts/sql/first-confirm-check.sql (S13) and scripts/prereg-e2e.mjs
-- (A14 to A16), never by a synthetic row here. The same reads on production
-- afterwards, to record in the handoff:
--   select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
--     from pg_trigger t where t.tgrelid = 'auth.users'::regclass and t.tgname = 'no_self_service_email_change';
--   select md5(pg_get_functiondef(p.oid)), p.prosecdef, pg_get_userbyid(p.proowner), p.proconfig
--     from pg_proc p where p.oid = 'auth_hooks.no_self_service_email_change()'::regprocedure;
-- Expect the trigger 'O', prosecdef true, owner postgres, {search_path=""}.
-- Local stack, 2026-10-21: md5 0acc73dc7e7a8606ac52b2c2a0efe825.
--
-- ORDER: needs neither 20261022100000 nor 20261022110000, and is safe with
-- main's code (the app never changes a sign-in email). Apply before sign-up
-- opens (app_settings.signup_open) and before any student invite, the same
-- day as the Change-email notice template (dashboard step 2). Each closes the
-- door alone (the template: no link or code reaches anyone, though GoTrue
-- still stores the change; this file: nothing is stored, though the old
-- template's mail still shows a link that goes nowhere). Together the
-- change is never stored and the mail that still goes out tells the truth.
--
-- HOW TO APPLY: locally `docker exec -i supabase_db_vibe psql -U postgres -d
-- postgres -v ON_ERROR_STOP=1 -q < this file`, then record the row below. On
-- production with the connector's apply_migration (the body without begin /
-- commit), then rename the row the connector records to this version:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261022120000', 'no_self_service_email_change') on conflict (version) do nothing;
--   (and delete the connector's own auto-timestamped row for this body)
--
-- ROLLBACK (Franky's yes; no data to undo, the trigger only ever refused):
--   drop trigger if exists no_self_service_email_change on auth.users;
--   drop function if exists auth_hooks.no_self_service_email_change();
--   delete from supabase_migrations.schema_migrations where version = '20261022120000';
-- After it, PUT /user can start an email change again: keep the notice
-- template in place (a change can then only be finished with a link or code
-- the mail no longer carries) and re-apply this file unchanged; its
-- pending count stops on any change started in between (count, ask, cancel).
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
-- The pending count is not here: it runs in section 3, once CREATE TRIGGER
-- holds its lock (see THE PENDING COUNT in the header).
do $$
begin
  if to_regnamespace('auth_hooks') is null then
    raise exception 'no-email-change: auth_hooks missing';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users'
        and column_name in ('email', 'email_change', 'deleted_at')) <> 3 then
    raise exception 'no-email-change: auth.users columns moved';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
              and tgname = 'no_self_service_email_change')
     or to_regprocedure('auth_hooks.no_self_service_email_change()') is not null then
    raise exception 'no-email-change: already applied';
  end if;
end $$;

-- 2. THE FUNCTION AND THE TRIGGER ---------------------------------------------------
-- The pattern of auth_hooks.first_confirm_drops_password (20261022110000).
-- Why it holds (GoTrue v2.197): GoTrue writes auth.users with UpdateOnly and
-- a column list, so "OF email_change" fires only on the writes that list it:
-- sendEmailChange and admin generateLink's email_change types (a new
-- address: refused), ConfirmEmailChange and ClearAllPendingTokens ('':
-- passes), SoftDeleteUser (with deleted_at: passes). The admin email change
-- (SetEmail) lists only `email`, so it never gets here.
create function auth_hooks.no_self_service_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A new address going into email_change: the first step of a self-service
  -- change. Refused, so GoTrue's request rolls back with its tokens; the
  -- mail it already sent carries a link and a code that match nothing.
  if coalesce(new.email_change, '') <> ''
     and new.email_change is distinct from old.email_change
     and new.deleted_at is null then
    raise exception 'no_self_service_email_change: a sign-in email is never changed through /user (Vibe has no email change)'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function auth_hooks.no_self_service_email_change() is
  'BEFORE UPDATE OF email_change on auth.users: refuses a write that puts a new address into email_change '
  '(GoTrue''s self-service email change); clearing it, the admin email change and soft deletes pass.';

revoke all on function auth_hooks.no_self_service_email_change() from public;
grant execute on function auth_hooks.no_self_service_email_change() to supabase_auth_admin;

-- The WHEN repeats the rule, so finishing or cancelling a change never
-- enters the function.
create trigger no_self_service_email_change
  before update of email_change on auth.users
  for each row
  when (coalesce(new.email_change, '') <> ''
        and new.email_change is distinct from old.email_change
        and new.deleted_at is null)
  execute function auth_hooks.no_self_service_email_change();

-- 3. POST-CHECK (catalog and counts only; nothing is written) -------------------------
do $$
declare
  bad       text := '';
  f         regprocedure := 'auth_hooks.no_self_service_email_change()'::regprocedure;
  tdef      text;
  v_pending integer;
begin
  -- The rule refuses a NEW address only, so a change pending from before
  -- this file could still be resent or finished. Counted here, after CREATE
  -- TRIGGER: its lock on auth.users lasts until COMMIT, so every earlier
  -- write has committed and shows up, and every later one meets the
  -- trigger. None on a clean apply.
  select count(*) into v_pending
    from auth.users where coalesce(email_change, '') <> '' and deleted_at is null;
  if v_pending > 0 then
    raise exception 'no-email-change: % account(s) have an email change pending (see PRE-FLIGHT in the header)', v_pending;
  end if;
  raise notice 'no-email-change: no email change pending';

  select pg_get_triggerdef(t.oid) into tdef from pg_trigger t
   where t.tgrelid = 'auth.users'::regclass and t.tgname = 'no_self_service_email_change' and t.tgenabled = 'O';
  if tdef is null then
    bad := bad || ' the trigger is missing or not enabled;';
  elsif tdef not like '%BEFORE UPDATE OF email_change ON auth.users FOR EACH ROW WHEN%'
        or tdef not like '%(new.email_change)::text IS DISTINCT FROM (old.email_change)::text%'
        or tdef not like '%(new.deleted_at IS NULL)%' then
    bad := bad || format(' the trigger reads %s;', tdef);
  end if;
  if not (select p.prosecdef and p.proconfig = array['search_path=""'] and pg_get_userbyid(p.proowner) = 'postgres'
            from pg_proc p where p.oid = f) then
    bad := bad || ' the function is not SECURITY DEFINER, search_path '''', owned by postgres;';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    bad := bad || ' PUBLIC holds EXECUTE on the function;';
  end if;
  if not has_function_privilege('supabase_auth_admin', f, 'execute') then
    bad := bad || ' supabase_auth_admin cannot execute the function;';
  end if;
  if bad <> '' then
    raise exception 'no-email-change post-check failed:%', bad;
  end if;
  raise notice 'no-email-change: no_self_service_email_change md5 is %', md5(pg_get_functiondef(f));
end $$;

notify pgrst, 'reload schema';

commit;
