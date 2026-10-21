-- ---------------------------------------------------------------------------
-- 20261022110000_first_confirm_drops_password.sql
--
-- PLAIN ENGLISH
-- Closes the sign-up pre-registration gap (written Oct 20, 2026; design:
-- prereg-design.md section 3, Migration B). Anyone could sign up with a
-- student's school address before the student did, and choose the password.
-- GoTrue never replaces the password of an account that is still waiting
-- for its code, so when the real student later typed the code, the earlier
-- password kept working. From now on, the moment an account Vibe emailed a
-- code or link to is confirmed for the first time, the database removes the
-- stored password, resets the starter name to 'Member' and clears the Terms
-- tick, inside GoTrue's own write and before any session exists. Whoever
-- chose them had not proven the inbox; the confirmation just did. The app
-- then sets the password the student typed on that page (or asks for one on
-- /auth/choose-password) and records the Terms tick again as 'confirm'.
-- Admin-made accounts, seeds, review accounts and local auto-confirm sign-ups
-- mail nothing, so nothing is removed from them. Needs 20261022100000.
--
-- WHAT IT DOES
--   auth_hooks.first_confirm_drops_password() and its BEFORE UPDATE trigger on
--   auth.users, column-scoped (email_confirmed_at, encrypted_password) and kept
--   off every other write by its WHEN clause. Two arms:
--     1. First confirmation (email_confirmed_at NULL -> set) of an account with
--        confirmation_sent_at or recovery_sent_at set (a code or link was
--        mailed), in a write that does not also set a password: the password
--        becomes NULL, and public.users gets password_needed_at = now(), name =
--        'Member' and no Terms version, acceptance or 18+ time. A failure in
--        that users write is only a WARNING: it never blocks a confirmation,
--        and the password is removed regardless. The first signer's 'signup'
--        row in terms_acceptances stays (the history is append-only).
--     2. A password written onto a confirmed account with no password by
--        anything except GoTrue's UpdatePassword (which always clears
--        confirmation_sent_at and recovery_sent_at in the same write): in the
--        same transaction as the wipe it is undone (WARNING); in any other it
--        is refused (P0001). In GoTrue v2.197 the only such writer is the
--        DB-encryption re-encrypt at sign-in (token.go:139-151).
--   No time rule: the attacker chooses when the confirmation happens (a
--   /recover link a scanner fetches, or the student typing the attacker's own
--   code), so only *_sent_at separates "mailed" from "made by an admin".
--
-- PRE-FLIGHT (inside, section 1; catalog and counts only): 20261022100000 is
-- in (column, function, the wider source check), auth.users still has the
-- four columns read here and encrypted_password is NULL-able, no confirmed
-- account has an empty password unless this trigger emptied it on an earlier
-- apply (it carries password_needed_at; arm 2 must only ever meet rows this
-- trigger emptied; their count is printed), not applied before, and
-- handle_new_user still names a new account 'Member' when no name is given.
-- On production (read 2026-10-20, catalog and counts only): encrypted_password,
-- email_confirmed_at, confirmation_sent_at and recovery_sent_at all NULL-able;
-- 0 confirmed accounts with an empty password; 20 of 20 password hashes start
-- '$2' (bcrypt; none '{'-prefixed, so DB password encryption is not in use and
-- arm 2's race cannot happen today); triggers on auth.users:
-- on_auth_user_created, waitlist_scrub_access_code. Read the GoTrue version
-- (/auth/v1/health) on the day: if it is newer than v2.197.0, re-read
-- Confirm, UpdatePassword, isOtpValid, recoverVerify, the admin update order
-- and the token.go re-encrypt before applying.
--
-- POST-CHECK (inside, section 3; catalog only, nothing written): the trigger
-- is enabled with both arms in its WHEN, the function is SECURITY DEFINER with
-- an empty search_path, owned by postgres, PUBLIC holds no EXECUTE and
-- supabase_auth_admin does; it prints the function's md5. A synthetic-row
-- check is NOT run here (it would write to auth.users and fire
-- handle_new_user on production; Franky's call, recommendation no); the
-- behaviour is checked by scripts/sql/first-confirm-check.sql and
-- scripts/prereg-e2e.mjs on the local stack, and by his live sign-up.
-- The same reads on production afterwards, to record in the handoff:
--   select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
--     from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal order by 1;
--   select md5(pg_get_functiondef(p.oid)), p.prosecdef, pg_get_userbyid(p.proowner), p.proconfig
--     from pg_proc p where p.oid = 'auth_hooks.first_confirm_drops_password()'::regprocedure;
-- Expect the trigger 'O' with both arms in its WHEN, prosecdef true, owner
-- postgres, {search_path=""}. Local stack, 2026-10-20: md5 0dee9fac626997a918ba22447598c427.
--
-- ORDER: apply AFTER the code that sets the password right after the code is
-- live (prereg-design.md section 9). Before it, new sign-ups would end with no
-- password and no prompt (degraded, not unsafe).
--
-- HOW TO APPLY: locally `docker exec -i supabase_db_vibe psql -U postgres -d
-- postgres -v ON_ERROR_STOP=1 -q < this file`, then record the row below. On
-- production with the connector's apply_migration (the body without begin /
-- commit), then rename the row the connector records to this version:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261022110000', 'first_confirm_drops_password') on conflict (version) do nothing;
--   (and delete the connector's own auto-timestamped row for this body)
--
-- ROLLBACK (Franky's yes; drop the trigger BEFORE any code rollback: the old
-- code does not set the password after the code):
--   drop trigger if exists first_confirm_drops_password on auth.users;
--   drop function if exists auth_hooks.first_confirm_drops_password();
--   delete from supabase_migrations.schema_migrations where version = '20261022110000';
-- Flags stay as they are: no hot page reads them, /auth/terms and the choose
-- page double-check with account_password_missing (in 20261022100000), and
-- accounts already emptied finish through the choose page or Forgot password,
-- but only while their Terms tick is still missing (next paragraph).
-- STRANDED ACCOUNTS after any window in which an emptied account met main's
-- code (the code rolled back while this trigger was live, or the trigger
-- dropped first and the code rolled back after, as allowed above): main's
-- /auth/terms and accept-terms record consent with no password check, so an
-- emptied account that ticks Terms there keeps its session, the flag and no
-- password. Back on the new code, /auth/terms lets it on as soon as consent
-- exists, before it reads the flag, so nothing sends it to the choose screen;
-- it finds out at "That email and password don't match" on a second device
-- (Forgot password still works). After such a window, count them (counts
-- only; the design's 2-day canary, password_needed_at < now() - 2 days, also
-- counts them, mixed with people who stopped half-way):
--   select count(*) from auth.users a join public.users u on u.id = a.id
--    where u.password_needed_at is not null and u.terms_accepted_at is not null
--      and coalesce(a.encrypted_password, '') = '';
-- If it is not 0, and only with Franky's yes, send exactly those back through
-- Terms, which then sends them to the choose screen (one statement; their
-- 'interstitial' history row stays, the history is append-only):
--   update public.users u set terms_version = null, terms_accepted_at = null, age_attested_at = null
--     from auth.users a where a.id = u.id and u.password_needed_at is not null
--      and u.terms_accepted_at is not null and coalesce(a.encrypted_password, '') = '';
-- RE-APPLY after a rollback (section 10: re-read the source, then this file
-- unchanged): the accounts emptied while it was live keep their NULL password
-- and their flag, and the pre-flight lets exactly those through (it prints
-- how many). It still stops on a confirmed account with no password and no
-- flag (an emptied account whose users write failed, or something else):
-- count those first, catalog and counts only, and ask Franky before going on.
-- scripts/prereg-e2e.mjs (A13) rehearses rollback + re-apply locally.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  v_def     text;
  v_waiting integer;
begin
  if to_regnamespace('auth_hooks') is null then
    raise exception 'first-confirm: auth_hooks missing';
  end if;
  if to_regprocedure('public.account_password_missing(uuid)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'users' and column_name = 'password_needed_at') then
    raise exception 'first-confirm: apply 20261022100000 first';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.terms_acceptances'::regclass
                  and contype = 'c' and pg_get_constraintdef(oid) like '%confirm%') then
    raise exception 'first-confirm: source check does not accept confirm';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users'
        and column_name in ('encrypted_password', 'email_confirmed_at', 'confirmation_sent_at', 'recovery_sent_at')) <> 4 then
    raise exception 'first-confirm: auth.users columns moved';
  end if;
  if (select is_nullable from information_schema.columns where table_schema = 'auth'
        and table_name = 'users' and column_name = 'encrypted_password') <> 'YES' then
    raise exception 'first-confirm: encrypted_password not nullable';
  end if;
  -- Arm 2 must only ever see rows this trigger emptied. On the first apply
  -- there are none (0 on production, 2026-10-20). On a re-apply after a
  -- rollback (prereg-design.md section 10: drop the trigger, re-read the
  -- source, re-apply), the accounts it emptied while it was live may still
  -- be waiting to choose a password: they carry password_needed_at, and arm
  -- 2 is built for exactly them, so they are counted, not refused. Any other
  -- confirmed account with no password stops the file.
  if exists (select 1 from auth.users a
              where a.email_confirmed_at is not null
                and coalesce(a.encrypted_password, '') = ''
                and not exists (select 1 from public.users p
                                 where p.id = a.id and p.password_needed_at is not null)) then
    raise exception 'first-confirm: a confirmed account already has no password and no password_needed_at';
  end if;
  select count(*) into v_waiting
    from auth.users a join public.users p on p.id = a.id
   where a.email_confirmed_at is not null and coalesce(a.encrypted_password, '') = ''
     and p.password_needed_at is not null;
  raise notice 'first-confirm: % emptied account(s) still choosing a password (0 on a first apply)', v_waiting;
  if exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
              and tgname = 'first_confirm_drops_password')
     or to_regprocedure('auth_hooks.first_confirm_drops_password()') is not null then
    raise exception 'first-confirm: already applied';
  end if;
  -- The name reset below must equal what a new account gets (20261008110000).
  v_def := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  if position('''Member''' in v_def) = 0 then
    raise exception 'first-confirm: handle_new_user no longer defaults the name to Member';
  end if;
end $$;

-- 2. THE FUNCTION AND THE TRIGGER ---------------------------------------------------
-- The pattern of auth_hooks.scrub_access_code_users (20261003130000:78-112).
-- Why it holds (GoTrue v2.197): every confirmation runs User.Confirm, an
-- UPDATE of confirmation_token and email_confirmed_at only (models/user.go:
-- 524-544); /verify accepts a code only while its *_sent_at is set
-- (verify.go:786-789) and Confirm leaves it alone, so every mailed
-- confirmation has OLD.confirmation_sent_at or OLD.recovery_sent_at set,
-- while admin.createUser and auto-confirm (nothing mailed) have both NULL.
-- Nothing later in the request writes encrypted_password, and /verify
-- reloads the row before it mints the session (verify.go:282-285).
create function auth_hooks.first_confirm_drops_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Arm 1. First confirmation of an account Vibe emailed a code or link to.
  -- Whoever chose this password had not proven the inbox; this confirmation
  -- just did. NULL is a value GoTrue writes itself (SetPassword(""),
  -- RemoveUnconfirmedIdentities) and reads as "no password" (token.go:116).
  if old.email_confirmed_at is null and new.email_confirmed_at is not null
     and (old.confirmation_sent_at is not null or old.recovery_sent_at is not null)
     and new.encrypted_password is not distinct from old.encrypted_password then
    new.encrypted_password := null;
    begin   -- "this transaction emptied this row" (read by arm 2); never in the way of a confirmation
      perform set_config('vibe.first_confirm_wiped', new.id::text, true);
    exception when others then
      raise warning 'first_confirm_drops_password: could not mark the wipe (%: %)', sqlstate, sqlerrm;
    end;
    begin
      update public.users
         set password_needed_at = now(),
             name = 'Member',   -- = TRIGGER_FALLBACK_NAME (onboarding-prefill.ts); onboarding blanks it
             terms_version = null, terms_accepted_at = null, age_attested_at = null   -- the first signer's tick and 18+
       where id = new.id;
    exception when others then
      -- Never block a confirmation. The wipe in NEW still happens.
      raise warning 'first_confirm_drops_password: profile reset skipped (%: %)', sqlstate, sqlerrm;
    end;
    return new;
  end if;

  -- Arm 2. A password written onto an emptied, confirmed row by anything
  -- other than GoTrue's UpdatePassword, which always clears
  -- confirmation_sent_at and recovery_sent_at in the same write
  -- (models/user.go:435-449). In v2.197 the only such writer is the
  -- DB-encryption re-encrypt at token.go:139-151 (a race with the wipe).
  if old.email_confirmed_at is not null
     and coalesce(old.encrypted_password, '') = '' and coalesce(new.encrypted_password, '') <> ''
     and (new.confirmation_sent_at is not null or new.recovery_sent_at is not null)
     and new.confirmation_sent_at is not distinct from old.confirmation_sent_at
     and new.recovery_sent_at is not distinct from old.recovery_sent_at then
    if current_setting('vibe.first_confirm_wiped', true) = new.id::text then
      -- Same request as the wipe (a future GoTrue writing its stale hash back
      -- after Confirm): keep the wipe, let the confirmation succeed.
      raise warning 'first_confirm_drops_password: kept the wipe against a later write in the same request';
      new.encrypted_password := old.encrypted_password;
      return new;
    end if;
    -- Any other request: fail loudly (the racing sign-in gets a 500;
    -- nothing honest takes this path).
    raise exception 'first_confirm_drops_password: password write refused (not through UpdatePassword)'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function auth_hooks.first_confirm_drops_password() is
  'BEFORE UPDATE on auth.users: a first mailed confirmation removes the earlier password, starter name and Terms tick, '
  'and flags public.users.password_needed_at; refuses a password write that skips UpdatePassword on such a row.';

revoke all on function auth_hooks.first_confirm_drops_password() from public;
grant execute on function auth_hooks.first_confirm_drops_password() to supabase_auth_admin;

-- The WHEN repeats both arms, so every other write to auth.users (sign-in
-- times, metadata, tokens) never enters the function.
create trigger first_confirm_drops_password
  before update of email_confirmed_at, encrypted_password on auth.users
  for each row
  when (
    (old.email_confirmed_at is null and new.email_confirmed_at is not null
       and (old.confirmation_sent_at is not null or old.recovery_sent_at is not null)
       and new.encrypted_password is not distinct from old.encrypted_password)
    or
    (old.email_confirmed_at is not null
       and coalesce(old.encrypted_password, '') = '' and coalesce(new.encrypted_password, '') <> ''
       and (new.confirmation_sent_at is not null or new.recovery_sent_at is not null)
       and new.confirmation_sent_at is not distinct from old.confirmation_sent_at
       and new.recovery_sent_at is not distinct from old.recovery_sent_at)
  )
  execute function auth_hooks.first_confirm_drops_password();

-- 3. POST-CHECK (catalog only; nothing is written) ------------------------------------
do $$
declare
  bad  text := '';
  f    regprocedure := 'auth_hooks.first_confirm_drops_password()'::regprocedure;
  tdef text;
begin
  select pg_get_triggerdef(t.oid) into tdef from pg_trigger t
   where t.tgrelid = 'auth.users'::regclass and t.tgname = 'first_confirm_drops_password' and t.tgenabled = 'O';
  if tdef is null then
    bad := bad || ' the trigger is missing or not enabled;';
  -- Postgres prints "a IS NOT DISTINCT FROM b" back as "NOT (a IS DISTINCT FROM b)".
  elsif tdef not like '%BEFORE UPDATE OF email_confirmed_at, encrypted_password ON auth.users%'
        or tdef not like '%(old.email_confirmed_at IS NULL)%'
        or tdef not like '%(old.confirmation_sent_at IS NOT NULL) OR (old.recovery_sent_at IS NOT NULL)%'
        or tdef not like '%NOT (new.recovery_sent_at IS DISTINCT FROM old.recovery_sent_at)%' then
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
    raise exception 'first-confirm post-check failed:%', bad;
  end if;
  raise notice 'first-confirm: first_confirm_drops_password md5 is %', md5(pg_get_functiondef(f));
end $$;

notify pgrst, 'reload schema';

commit;
